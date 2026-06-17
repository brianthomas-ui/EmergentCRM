import { createContext, useContext, useState, useEffect } from "react";
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

  const login = async (email, password) => {
    const { data } = await client.post("/auth/login", { email, password });
    localStorage.setItem("crm_token", data.token);
    setUser(data.user);
    return data.user;
  };

  const logout = () => {
    localStorage.removeItem("crm_token");
    setUser(false);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, isAdmin: user?.role === "admin" }}>
      {children}
    </AuthContext.Provider>
  );
}
