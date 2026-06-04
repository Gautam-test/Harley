import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { Button, Input } from '@hd-cpo/ui';
import { useAuthStore } from '../store/auth';

interface FormValues {
  email: string;
  password: string;
}

export function LoginPage() {
  const navigate = useNavigate();
  const setSession = useAuthStore((s) => s.setSession);
  const [error, setError] = useState<string | null>(null);
  // QA: password masking toggle state — mirrors the dealer-portal eye
  // icon so admins can review their entered characters before submit.
  const [showPassword, setShowPassword] = useState(false);
  // Session-expiry banner — set by api.ts when a 12-hour session times out
  // and the silent-refresh fails. Cleared on first read so navigating back
  // to /login from a fresh action doesn't re-show the toast.
  const [sessionExpired, setSessionExpired] = useState(false);
  useEffect(() => {
    try {
      if (window.sessionStorage.getItem('hd-cpo:session-expired') === '1') {
        setSessionExpired(true);
        window.sessionStorage.removeItem('hd-cpo:session-expired');
      }
    } catch { /* ignore */ }
  }, []);
  const { register, handleSubmit, formState } = useForm<FormValues>();

  const onSubmit = async (values: FormValues) => {
    setError(null);
    const apiBase = ((import.meta.env.VITE_API_URL as string | undefined) ?? '').replace(/\/$/, '') + '/api/v1';
    const res = await fetch(`${apiBase}/auth/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: { message: string } } | null;
      setError(body?.error?.message ?? 'Login failed');
      return;
    }
    const data = (await res.json()) as {
      accessToken: string;
      refreshToken: string;
      sessionExpiresAt: number;
      user: { id: string; role: 'ADMIN'; name: string };
    };
    setSession(data);
    navigate('/dashboard');
  };

  return (
    <div className="min-h-screen bg-surface-light flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-hd-white border border-gray-200 p-8 shadow-sm">
        <h1 className="font-headline text-3xl tracking-headline text-text-on-light">
          H-D <span className="text-hd-orange">ADMIN</span>
        </h1>
        <p className="text-gray-600 text-sm mt-2">Network oversight for H-D Certified.</p>
        <form onSubmit={handleSubmit(onSubmit)} className="mt-8 space-y-4">
          <div>
            <label className="block text-xs font-subhead uppercase tracking-subhead text-gray-600 mb-2">
              Email
            </label>
            <Input
              type="email"
              autoComplete="email"
              {...register('email', { required: true })}
            />
          </div>
          <div>
            <label className="block text-xs font-subhead uppercase tracking-subhead text-gray-600 mb-2">
              Password
            </label>
            {/* QA: relative wrapper so the eye toggle sits inside the
                input on the right edge — exact mirror of the dealer
                portal sign-in implementation. */}
            <div className="relative">
              <Input
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                className="pr-10"
                {...register('password', { required: true, minLength: 8 })}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                aria-pressed={showPassword}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-text-on-light p-1"
              >
                {showPassword ? (
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
                    <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
                    <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
                    <line x1="2" y1="2" x2="22" y2="22" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
          </div>
          {sessionExpired && !error && (
            <div className="text-warning text-sm bg-warning/10 border border-warning/40 px-3 py-2 font-subhead uppercase tracking-subhead text-xs">
              Session timed out
            </div>
          )}
          {error && <div className="text-danger text-sm">{error}</div>}
          <Button type="submit" className="w-full" disabled={formState.isSubmitting}>
            {formState.isSubmitting ? 'Signing in…' : 'Sign In'}
          </Button>
        </form>
        {/* QA latest: plaintext demo credentials removed from the admin
            sign-in page entirely — an unauthorised credential leak. */}
      </div>
    </div>
  );
}
