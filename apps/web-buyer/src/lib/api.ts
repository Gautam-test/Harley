import { useOtpStore } from '../store/otp';

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

interface ApiOptions extends RequestInit {
  /** Send the persisted OTP verified token as Bearer for lead-creation calls. */
  withOtpToken?: boolean;
}

export async function api<T>(path: string, init?: ApiOptions): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((init?.headers as Record<string, string>) ?? {}),
  };
  if (init?.withOtpToken) {
    const token = useOtpStore.getState().verifiedToken;
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`/api/v1${path}`, { ...init, headers });
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
  return (await res.json()) as T;
}
