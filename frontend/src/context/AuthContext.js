import { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import client from "@/api";

const AuthContext = createContext();
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // null = checking, false = logged out

  useEffect(() => {
    const token = localStorage.getItem("crm_token");
    if (!token) {
      setUser(false);
      return;
    }
    client
      .get("/auth/me")
      .then((r) => setUser(r.data))
      .catch(() => {
        localStorage.removeItem("crm_token");
        setUser(false);
      });
  }, []);

  const login = useCallback(async (email, password) => {
    const { data } = await client.post("/auth/login", { email, password });
    localStorage.setItem("crm_token", data.token);
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("crm_token");
    setUser(false);
  }, []);

  // Memoized so the context value keeps a stable reference between renders.
  const value = useMemo(
    () => ({ user, login, logout, isAdmin: user?.role === "admin" }),
    [user, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
