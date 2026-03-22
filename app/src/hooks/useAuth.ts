import { useState, useCallback } from "react";
import { api, setToken, clearToken, hasToken } from "../lib/api";

export interface UseAuthReturn {
  isAuthenticated: boolean;
  login: (setupCode: string) => Promise<void>;
  logout: () => void;
  error: string | null;
}

export function useAuth(): UseAuthReturn {
  const [isAuthenticated, setIsAuthenticated] = useState(hasToken());
  const [error, setError] = useState<string | null>(null);

  const login = useCallback(async (setupCode: string) => {
    setError(null);
    try {
      const { token } = await api.auth.login(setupCode);
      setToken(token);
      setIsAuthenticated(true);
    } catch (err: any) {
      const msg = err.message?.includes("401")
        ? "Invalid setup code"
        : "Connection failed";
      setError(msg);
      throw err;
    }
  }, []);

  const logout = useCallback(() => {
    clearToken();
    setIsAuthenticated(false);
  }, []);

  return { isAuthenticated, login, logout, error };
}
