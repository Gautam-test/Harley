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
  /** Absolute session expiry in epoch ms — reported by the API at login
   *  AND on every silent refresh. ENH-001 sliding mode: each successful
   *  refresh pushes this value forward, the App.tsx useEffect re-runs
   *  and reschedules the auto-logout timer. Persisted so a page reload
   *  still knows when to auto-logout. */
  sessionExpiresAt: number | null;
  setSession: (s: {
    accessToken: string;
    refreshToken: string;
    user: AuthUser;
    sessionExpiresAt: number;
  }) => void;
  /** Replace just the access token after a silent refresh. */
  setAccessToken: (token: string) => void;
  /** Replace tokens + the sliding-window expiry after a silent refresh. */
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
          // Only update if the server actually sent one — keeps the
          // store backwards-compatible if a future API version drops it.
          sessionExpiresAt:
            typeof s.sessionExpiresAt === 'number'
              ? s.sessionExpiresAt
              : prev.sessionExpiresAt,
        })),
      clear: () =>
        set({ accessToken: null, refreshToken: null, user: null, sessionExpiresAt: null }),
    }),
    { name: 'hd-cpo-dealer-auth' },
  ),
);
