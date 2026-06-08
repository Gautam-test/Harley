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

// API base URL — production deploys set VITE_API_URL to the API service URL,
// or leave it empty when a reverse-proxy forwards /api/* to the API host.
const API_BASE =
  ((import.meta.env.VITE_API_URL as string | undefined) ?? '').replace(/\/$/, '') +
  '/api/v1';

// Hard cap on how long any single API call can hang. See web-dealer/api.ts
// for the full rationale (mirrored here so admin shares the same defence
// against hung backends / mis-routed reverse-proxies on demo).
const FETCH_TIMEOUT_MS = 10_000;

async function fetchWithTimeout(input: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(input, { ...init, signal: init?.signal ?? controller.signal });
  } catch (e) {
    if ((e as Error).name === 'AbortError') {
      throw new ApiError(504, 'TIMEOUT', `API did not respond within ${FETCH_TIMEOUT_MS / 1000}s — backend may be down`);
    }
    throw new ApiError(0, 'NETWORK_ERROR', 'Could not reach the API. Check your connection.');
  } finally {
    window.clearTimeout(timeoutId);
  }
}

// One in-flight refresh promise across concurrent 401s — see web-dealer/api.ts
// for the rationale.
let refreshInFlight: Promise<string | null> | null = null;

async function refreshAccessTokenOnce(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight;
  const refreshToken = useAuthStore.getState().refreshToken;
  if (!refreshToken) return null;
  refreshInFlight = (async () => {
    try {
      const res = await fetchWithTimeout(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) return null;
      const body = (await res.json()) as {
        accessToken?: string;
        refreshToken?: string;
        sessionExpiresAt?: number;
      };
      if (!body.accessToken || !body.refreshToken) return null;
      // Persist BOTH — the server rotates the refresh token on every call,
      // and re-sending the old one on the next refresh would trigger
      // reuse-detect and revoke every session for this account.
      // ENH-001 sliding mode: forward the fresh sessionExpiresAt so
      // App.tsx reschedules its auto-logout to the new instant.
      useAuthStore.getState().setRefreshedTokens({
        accessToken: body.accessToken,
        refreshToken: body.refreshToken,
        sessionExpiresAt: body.sessionExpiresAt,
      });
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
  const res = await fetchWithTimeout(`${API_BASE}${path}`, {
    ...init,
    headers: buildHeaders(init, token),
  });

  if (res.status === 401 && !init?._retried) {
    const newToken = await refreshAccessTokenOnce();
    if (newToken) {
      const retry = await fetchWithTimeout(`${API_BASE}${path}`, {
        ...init,
        headers: buildHeaders(init, newToken),
      });
      if (retry.ok) return (await retry.json()) as T;
      if (retry.status === 401) {
        useAuthStore.getState().clear();
        try { window.sessionStorage.setItem('hd-cpo:session-expired', '1'); } catch { /* ignore */ }
      }
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
    try { window.sessionStorage.setItem('hd-cpo:session-expired', '1'); } catch { /* ignore */ }
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
  // Guard against non-JSON 200 (reverse-proxy serving SPA's index.html
  // for /api/* on a mis-configured demo). See web-dealer/api.ts.
  const contentType = res.headers.get('content-type') ?? '';
  if (!contentType.includes('json')) {
    throw new ApiError(
      502,
      'BAD_RESPONSE',
      'API returned non-JSON. Check the reverse-proxy is forwarding /api/* to the API host.',
    );
  }
  return (await res.json()) as T;
}
