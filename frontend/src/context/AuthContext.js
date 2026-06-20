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
    } catch (error) {
      // Logout must always proceed locally even if the server call fails
      // (e.g. network/CSRF). Log for diagnostics rather than swallowing silently.
      console.warn("Logout request failed; clearing session locally anyway:", error);
    }
    setUser(false);
  }, []);

  // Re-fetch the signed-in user (e.g. after the user updates their avatar).
  const refreshUser = useCallback(async () => {
    const { data } = await client.get("/auth/me");
    setUser(data);
    return data;
  }, []);

  // Admin "view as": become the selected agent (server swaps the session cookie).
  const startImpersonation = useCallback(async (agentId) => {
    await client.post("/admin/impersonate", { agent_id: agentId });
    const { data } = await client.get("/auth/me");
    setUser(data);
    return data;
  }, []);

  // Return to the original manager session.
  const stopImpersonation = useCallback(async () => {
    await client.post("/admin/stop-impersonate");
    const { data } = await client.get("/auth/me");
    setUser(data);
    return data;
  }, []);

  // Memoized so the context value keeps a stable reference between renders.
  const value = useMemo(
    () => ({
      user, login, logout, refreshUser, startImpersonation, stopImpersonation,
      isAdmin: user?.role === "admin",
      impersonating: !!user?.impersonating,
    }),
    [user, login, logout, refreshUser, startImpersonation, stopImpersonation]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
