import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AuthUser {
  id: string;
  role: 'DEALER';
  name: string;
}

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: AuthUser | null;
  /** Absolute session expiry in epoch ms — reported by the API at login.
   *  Persisted so a page reload still knows when to auto-logout, and
   *  consumed by App.tsx to schedule a single setTimeout. Independent of
   *  individual JWT TTLs; this is the wall-clock ceiling regardless of
   *  refresh activity. */
  sessionExpiresAt: number | null;
  setSession: (s: {
    accessToken: string;
    refreshToken: string;
    user: AuthUser;
    sessionExpiresAt: number;
  }) => void;
  /** Replace just the access token after a silent refresh. */
  setAccessToken: (token: string) => void;
  /** Replace tokens after a silent refresh. sessionExpiresAt is unchanged
   *  by rotation — the server keeps the original session-start. */
  setRefreshedTokens: (s: { accessToken: string; refreshToken: string }) => void;
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
        set({ accessToken: s.accessToken, refreshToken: s.refreshToken }),
      clear: () =>
        set({ accessToken: null, refreshToken: null, user: null, sessionExpiresAt: null }),
    }),
    { name: 'hd-cpo-dealer-auth' },
  ),
);
