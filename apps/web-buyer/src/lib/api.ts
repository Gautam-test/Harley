import { useOtpStore } from '../store/otp';

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

interface ApiOptions extends RequestInit {
  /** Send the persisted OTP verified token as Bearer for lead-creation calls. */
  withOtpToken?: boolean;
  /** Set true for FormData bodies so we skip Content-Type. */
  formData?: boolean;
}

// API base URL — production deploys set VITE_API_URL to the API service URL
// (e.g. https://harley-api.onrender.com). On reverse-proxied deployments
// (Apache/nginx in front of API + SPA) leave it empty so the path stays
// relative and the proxy forwards `/api/*` to the API host. In local dev
// VITE_API_URL is empty so Vite's proxy forwards to :4001.
const API_BASE =
  (import.meta.env.VITE_API_URL as string | undefined ?? '').replace(/\/$/, '') +
  '/api/v1';

// Hard cap on how long any single API call can hang before we abort and
// surface a readable error. Without this the buyer modal sat with
// busy=true (Verify + Resend disabled) until the upstream's own timeout
// fired — usually 60s for an Apache reverse-proxy to an unresponsive
// backend. 10s is comfortable for OTP send/verify (which complete in
// <500ms when healthy) and short enough that a hung call surfaces fast.
const FETCH_TIMEOUT_MS = 10_000;

export async function api<T>(path: string, init?: ApiOptions): Promise<T> {
  const headers: Record<string, string> = {
    ...(init?.formData ? {} : { 'Content-Type': 'application/json' }),
    ...((init?.headers as Record<string, string>) ?? {}),
  };
  if (init?.withOtpToken) {
    const token = useOtpStore.getState().verifiedToken;
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  // AbortController so a hung backend never wedges a modal in busy state.
  // The signal is forwarded if the caller already passed one (rare).
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers,
      signal: init?.signal ?? controller.signal,
    });
  } catch (e) {
    window.clearTimeout(timeoutId);
    if ((e as Error).name === 'AbortError') {
      throw new ApiError(
        504,
        'TIMEOUT',
        `API did not respond within ${FETCH_TIMEOUT_MS / 1000}s — backend may be down`,
      );
    }
    throw new ApiError(0, 'NETWORK_ERROR', 'Could not reach the API. Check your connection.');
  }
  window.clearTimeout(timeoutId);

  if (!res.ok) {
    if (res.status === 401 && init?.withOtpToken) {
      useOtpStore.getState().clear();
    }
    const body = (await res.json().catch(() => null)) as
      | { error?: { code: string; message: string } }
      | null;
    throw new ApiError(
      res.status,
      body?.error?.code ?? 'UNKNOWN',
      body?.error?.message ?? `Request failed: ${res.status}`,
    );
  }
  // Guard against the demo / mis-deployed case where VITE_API_URL was not
  // baked into the build OR the reverse-proxy isn't routing /api/* to the
  // API — a static-file host returns the SPA's index.html with HTTP 200,
  // and `await res.json()` would throw a confusing
  // `SyntaxError: Unexpected token '<'`. Detect HTML-shaped responses
  // explicitly and throw a clean ApiError so callers get a readable error
  // (and modal `busy` flags reset cleanly via .finally).
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
