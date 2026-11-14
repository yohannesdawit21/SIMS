import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';
import { api } from '../api/axios';
import type { AuthUser } from '../types';

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function loadStoredUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem('sims_user');
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(loadStoredUser);
  const [token, setToken] = useState<string | null>(
    () => localStorage.getItem('sims_token'),
  );

  const login = useCallback(async (username: string, password: string) => {
    const res = await api.post<{
      success: boolean;
      data: { access_token: string; user: AuthUser };
    }>('/auth/login', { username, password });

    const { access_token, user: authUser } = res.data.data;
    localStorage.setItem('sims_token', access_token);
    localStorage.setItem('sims_user', JSON.stringify(authUser));
    setToken(access_token);
    setUser(authUser);
  }, []);

  const logout = useCallback(async () => {
    // 1. Immediately clear local storage and state for immediate UI response
    localStorage.removeItem('sims_token');
    localStorage.removeItem('sims_user');
    setToken(null);
    setUser(null);

    // 2. Notify backend in background (do not block UI if backend is slow/offline)
    try {
      await api.post('/auth/logout');
    } catch {
      // ignore errors during logout
    }
  }, []);

  const value = useMemo(
    () => ({ user, token, login, logout, isAuthenticated: !!token }),
    [user, token, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
