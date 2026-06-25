import { useAuthStore } from '../store/auth';

/** Shape of details emitted by Zod's `.flatten()` — surfaced verbatim by
 *  the API's `errorHandler` for VALIDATION_ERROR responses. The wizard
 *  reads these to render per-field validation messages instead of the
 *  generic "Invalid request payload" headline. */
export interface ApiErrorDetails {
  formErrors?: string[];
  fieldErrors?: Record<string, string[] | undefined>;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: ApiErrorDetails,
  ) {
    super(message);
  }
}

interface ApiOptions extends RequestInit {
  /** Set true when sending FormData; we omit Content-Type so the browser
   *  emits the correct multipart boundary header. */
  formData?: boolean;
  /** Override the default 10s timeout. Use a higher value for file uploads. */
  timeoutMs?: number;
  /** Internal — set when retrying after a silent refresh, so we never loop. */
  _retried?: boolean;
}

// API base URL — production deploys set VITE_API_URL to the API service URL,
// or leave it empty when a reverse-proxy (Apache/nginx) forwards /api/* to
// the API host. Local dev leaves it empty so Vite's proxy handles it.
const API_BASE =
  ((import.meta.env.VITE_API_URL as string | undefined) ?? '').replace(/\/$/, '') +
  '/api/v1';

// Hard cap on how long any single API call can hang before we abort and
// surface a readable error. Without this, callers (forms, dashboards)
// would sit with a busy spinner until the upstream's own timeout fired
// (60s+ on Apache reverse-proxy to an unresponsive backend).
const FETCH_TIMEOUT_MS = 10_000;

/** fetch wrapper with abort-on-timeout. Throws ApiError(504, TIMEOUT) on
 *  cap exceeded, ApiError(0, NETWORK_ERROR) on raw network failure. */
async function fetchWithTimeout(input: string, init?: RequestInit, timeoutMs = FETCH_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
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

/** F6/F8: download an authenticated CSV export and trigger a browser save.
 *  Sends the in-memory bearer token (a plain anchor/window.open can't). */
export async function downloadCsv(path: string, filename: string): Promise<void> {
  const token = useAuthStore.getState().accessToken;
  const res = await fetchWithTimeout(`${API_BASE}${path}`, {
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  if (!res.ok) throw new ApiError(res.status, 'EXPORT_FAILED', 'Export failed');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Single in-flight refresh promise shared across concurrent 401s. Without this,
// five parallel requests that all expire together would each fire their own
// /auth/refresh, race, and overwrite each other's token.
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
      // Store both — the server rotates the refresh token on every call,
      // so re-using the old one would trigger reuse-detect on the next
      // refresh and revoke every session for this account.
      // ENH-001 sliding mode: server sends a fresh sessionExpiresAt on
      // each refresh (= now + 24h). Forward it to the store so the
      // App.tsx auto-logout effect reschedules to the new instant.
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
  const timeout = init?.timeoutMs ?? FETCH_TIMEOUT_MS;
  const res = await fetchWithTimeout(`${API_BASE}${path}`, {
    ...init,
    headers: buildHeaders(init, token),
  }, timeout);

  if (res.status === 401 && !init?._retried) {
    const newToken = await refreshAccessTokenOnce();
    if (newToken) {
      const retry = await fetchWithTimeout(`${API_BASE}${path}`, {
        ...init,
        headers: buildHeaders(init, newToken),
      }, timeout);
      if (retry.ok) return (await retry.json()) as T;
      if (retry.status === 401) {
        useAuthStore.getState().clear();
        // Flag the next /login render so it can show a "Session expired"
        // banner instead of the bare sign-in form. sessionStorage clears
        // when the tab closes, so the banner doesn't outlive the session.
        try { window.sessionStorage.setItem('hd-cpo:session-expired', '1'); } catch { /* ignore */ }
      }
      const body = (await retry.json().catch(() => null)) as
        | { error?: { code: string; message: string; details?: ApiErrorDetails } }
        | null;
      throw new ApiError(
        retry.status,
        body?.error?.code ?? 'UNKNOWN',
        body?.error?.message ?? `Request failed: ${retry.status}`,
        body?.error?.details,
      );
    }
    useAuthStore.getState().clear();
    try { window.sessionStorage.setItem('hd-cpo:session-expired', '1'); } catch { /* ignore */ }
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as
      | { error?: { code: string; message: string; details?: ApiErrorDetails } }
      | null;
    throw new ApiError(
      res.status,
      body?.error?.code ?? 'UNKNOWN',
      body?.error?.message ?? `Request failed: ${res.status}`,
      body?.error?.details,
    );
  }
  // Guard against the demo / mis-deployed case where the reverse-proxy
  // serves the SPA's index.html for /api/* (HTTP 200 with HTML body) —
  // `await res.json()` would otherwise throw a confusing SyntaxError that
  // surfaces as "Could not load…" with no actionable detail.
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
