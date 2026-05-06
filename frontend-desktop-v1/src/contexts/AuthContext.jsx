import { createContext, useContext, useEffect, useState, useCallback } from "react";
import api, { getAuthToken, setAuthToken } from "../api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const checkAuth = useCallback(async () => {
    try {
      if (!getAuthToken()) { setUser(null); setLoading(false); return; }
      const { data } = await api.get("/auth/me");
      setUser(data);
    } catch (err) {
      if (process.env.NODE_ENV !== "production") console.debug("[auth] session check failed:", err?.message);
      setUser(null);
      setAuthToken(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // If returning from OAuth, AuthCallback handles session exchange first.
    if (typeof window !== "undefined" && window.location.hash?.includes("session_id=")) {
      setLoading(false);
      return;
    }
    checkAuth();
  }, [checkAuth]);

  const logout = async () => {
    try { await api.post("/auth/logout"); }
    catch (err) {
      if (process.env.NODE_ENV !== "production") console.debug("[auth] logout request failed:", err?.message);
    }
    setAuthToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, setUser, loading, checkAuth, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
