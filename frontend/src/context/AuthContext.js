import { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import client from "@/api";

const AuthContext = createContext();
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // null = checking, false = logged out

  useEffect(() => {
    // Session lives in an httpOnly cookie; ask the server who we are.
    client
      .get("/auth/me")
      .then((r) => setUser(r.data))
      .catch(() => setUser(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = useCallback(async (email, password) => {
    const { data } = await client.post("/auth/login", { email, password });
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await client.post("/auth/logout");
    } catch {
      /* ignore network/csrf errors on logout */
    }
    setUser(false);
  }, []);

  // Re-fetch the signed-in user (e.g. after the user updates their avatar).
  const refreshUser = useCallback(async () => {
    const { data } = await client.get("/auth/me");
    setUser(data);
    return data;
  }, []);

  // Memoized so the context value keeps a stable reference between renders.
  const value = useMemo(
    () => ({ user, login, logout, refreshUser, isAdmin: user?.role === "admin" }),
    [user, login, logout, refreshUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
