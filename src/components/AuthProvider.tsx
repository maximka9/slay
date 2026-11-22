import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, mutation, type MeResponse } from '../lib/api';

type AuthState = MeResponse & { loading: boolean; refresh: () => Promise<void>; logout: () => Promise<void>; loginUrl: (returnTo?: string) => string };
const AuthContext = createContext<AuthState | null>(null);

const anonymous: MeResponse = { authenticated: false, isAdmin: false, user: null };

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<MeResponse>(anonymous);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    try { setState(await api<MeResponse>('/api/me')); }
    catch { setState(anonymous); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  const logout = useCallback(async () => {
    let token = state.csrfToken;
    if (!token) {
      // CSRF-токена нет (например, страница открыта давно) — сначала обновляем сессию.
      const fresh = await api<MeResponse>('/api/me').catch(() => anonymous);
      token = fresh.csrfToken;
      if (!fresh.authenticated || !token) { setState(anonymous); return; }
    }
    await mutation('/api/auth/logout', 'POST', token, {});
    setState(anonymous);
  }, [state.csrfToken]);
  const value = useMemo<AuthState>(() => ({ ...state, loading, refresh, logout, loginUrl: (returnTo = '/vote') => `/api/auth/login?returnTo=${encodeURIComponent(returnTo)}` }), [loading, logout, refresh, state]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
