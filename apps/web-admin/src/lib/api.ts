import { useAuthStore } from '../store/auth';

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

interface ApiOptions extends RequestInit {
  /** When uploading FormData, omit Content-Type so the browser sets boundary. */
  formData?: boolean;
  /** Internal — set when retrying after a silent refresh, so we never loop. */
  _retried?: boolean;
}

// API base URL — production deploys set VITE_API_URL to the Render service URL.
// Local dev leaves it empty so paths stay relative and Vite's proxy handles it.
const API_BASE =
  ((import.meta.env.VITE_API_URL as string | undefined) ?? '').replace(/\/$/, '') +
  '/api/v1';

// One in-flight refresh promise across concurrent 401s — see web-dealer/api.ts
// for the rationale.
let refreshInFlight: Promise<string | null> | null = null;

async function refreshAccessTokenOnce(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight;
  const refreshToken = useAuthStore.getState().refreshToken;
  if (!refreshToken) return null;
  refreshInFlight = (async () => {
    try {
      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) return null;
      const body = (await res.json()) as { accessToken?: string };
      if (!body.accessToken) return null;
      useAuthStore.getState().setAccessToken(body.accessToken);
      return body.accessToken;
    } catch {
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

function buildHeaders(init: ApiOptions | undefined, token: string | null): Record<string, string> {
  return {
    ...(init?.formData ? {} : { 'Content-Type': 'application/json' }),
    ...((init?.headers as Record<string, string>) ?? {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export async function api<T>(path: string, init?: ApiOptions): Promise<T> {
  const token = useAuthStore.getState().accessToken;
  const res = await fetch(`${API_BASE}${path}`, { ...init, headers: buildHeaders(init, token) });

  if (res.status === 401 && !init?._retried) {
    const newToken = await refreshAccessTokenOnce();
    if (newToken) {
      const retry = await fetch(`${API_BASE}${path}`, {
        ...init,
        headers: buildHeaders(init, newToken),
      });
      if (retry.ok) return (await retry.json()) as T;
      if (retry.status === 401) useAuthStore.getState().clear();
      const body = (await retry.json().catch(() => null)) as
        | { error?: { code: string; message: string } }
        | null;
      throw new ApiError(
        retry.status,
        body?.error?.code ?? 'UNKNOWN',
        body?.error?.message ?? `Request failed: ${retry.status}`,
      );
    }
    useAuthStore.getState().clear();
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as
      | { error?: { code: string; message: string } }
      | null;
    throw new ApiError(
      res.status,
      body?.error?.code ?? 'UNKNOWN',
      body?.error?.message ?? `Request failed: ${res.status}`,
    );
  }
  return (await res.json()) as T;
}
