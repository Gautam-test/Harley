import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AuthUser {
  id: string;
  role: 'ADMIN';
  name: string;
}

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: AuthUser | null;
  /** Wall-clock session ceiling (epoch ms) — see web-dealer/store/auth.ts. */
  sessionExpiresAt: number | null;
  setSession: (s: {
    accessToken: string;
    refreshToken: string;
    user: AuthUser;
    sessionExpiresAt: number;
  }) => void;
  setAccessToken: (token: string) => void;
  /** Replace tokens + the sliding-window expiry after rotation. ENH-001
   *  sliding mode: server returns a fresh sessionExpiresAt on every
   *  successful refresh; the App.tsx auto-logout effect reschedules. */
  setRefreshedTokens: (s: {
    accessToken: string;
    refreshToken: string;
    sessionExpiresAt?: number;
  }) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      sessionExpiresAt: null,
      setSession: (s) =>
        set({
          accessToken: s.accessToken,
          refreshToken: s.refreshToken,
          user: s.user,
          sessionExpiresAt: s.sessionExpiresAt,
        }),
      setAccessToken: (token) => set({ accessToken: token }),
      setRefreshedTokens: (s) =>
        set((prev) => ({
          accessToken: s.accessToken,
          refreshToken: s.refreshToken,
          sessionExpiresAt:
            typeof s.sessionExpiresAt === 'number'
              ? s.sessionExpiresAt
              : prev.sessionExpiresAt,
        })),
      clear: () =>
        set({ accessToken: null, refreshToken: null, user: null, sessionExpiresAt: null }),
    }),
    { name: 'hd-cpo-admin-auth' },
  ),
);
