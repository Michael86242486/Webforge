import { useState, useEffect, useCallback } from "react";

export interface AuthUser {
  id: number;
  email: string;
  username: string;
  role: "user" | "admin";
  createdAt?: string;
}

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "") + "/../api";

function getStoredToken(): string | null {
  try { return localStorage.getItem("wre_token"); } catch { return null; }
}

function storeToken(token: string): void {
  try { localStorage.setItem("wre_token", token); } catch { /* noop */ }
}

function clearToken(): void {
  try { localStorage.removeItem("wre_token"); } catch { /* noop */ }
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    user: null,
    token: getStoredToken(),
    isLoading: true,
    isAuthenticated: false,
  });

  const fetchMe = useCallback(async (token: string) => {
    try {
      const res = await fetch(`${API_BASE}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
        credentials: "include",
      });
      if (res.ok) {
        const user = await res.json() as AuthUser;
        setState({ user, token, isLoading: false, isAuthenticated: true });
        return true;
      }
    } catch { /* network error */ }
    clearToken();
    setState({ user: null, token: null, isLoading: false, isAuthenticated: false });
    return false;
  }, []);

  useEffect(() => {
    const token = getStoredToken();
    if (token) {
      fetchMe(token);
    } else {
      setState(s => ({ ...s, isLoading: false }));
    }
  }, [fetchMe]);

  const login = useCallback(async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json() as { token?: string; user?: AuthUser; error?: string };
      if (!res.ok) return { success: false, error: data.error ?? "Login failed" };
      if (data.token && data.user) {
        storeToken(data.token);
        setState({ user: data.user, token: data.token, isLoading: false, isAuthenticated: true });
        return { success: true };
      }
      return { success: false, error: "Invalid response" };
    } catch (err) {
      return { success: false, error: "Network error" };
    }
  }, []);

  const register = useCallback(async (email: string, password: string, username: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await fetch(`${API_BASE}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password, username }),
      });
      const data = await res.json() as { token?: string; user?: AuthUser; error?: string };
      if (!res.ok) return { success: false, error: data.error ?? "Registration failed" };
      if (data.token && data.user) {
        storeToken(data.token);
        setState({ user: data.user, token: data.token, isLoading: false, isAuthenticated: true });
        return { success: true };
      }
      return { success: false, error: "Invalid response" };
    } catch {
      return { success: false, error: "Network error" };
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch(`${API_BASE}/auth/logout`, { method: "POST", credentials: "include" });
    } catch { /* best effort */ }
    clearToken();
    setState({ user: null, token: null, isLoading: false, isAuthenticated: false });
  }, []);

  return { ...state, login, register, logout, refetch: () => state.token ? fetchMe(state.token) : Promise.resolve(false) };
}
