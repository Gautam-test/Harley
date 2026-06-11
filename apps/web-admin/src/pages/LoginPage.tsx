import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { Button, Input } from '@hd-cpo/ui';
import { useAuthStore } from '../store/auth';
import { ForgotPasswordModal } from '../components/ForgotPasswordModal';

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
  // Session-expiry banner — set by api.ts when the configured 24-hour
  // session (ENH-001) times out
  // and the silent-refresh fails. Cleared on first read so navigating back
  // to /login from a fresh action doesn't re-show the toast.
  const [sessionExpired, setSessionExpired] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  useEffect(() => {
    try {
      if (window.sessionStorage.getItem('hd-cpo:session-expired') === '1') {
        setSessionExpired(true);
        window.sessionStorage.removeItem('hd-cpo:session-expired');
      }
    } catch { /* ignore */ }
  }, []);
  const { register, handleSubmit, formState, formState: { errors } } = useForm<FormValues>({
    mode: 'onSubmit',
    reValidateMode: 'onChange',
  });

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
        <img
          src={`${import.meta.env.BASE_URL}brand/hd-certified-wordmark.svg`}
          alt="H-D Certified"
          className="h-8 w-auto"
          width={172}
          height={32}
          decoding="async"
        />
        <p className="text-gray-600 text-sm mt-3">Network oversight for H-D Certified.</p>
        {/* Buyer-bounce link — a customer who typed /admin by accident
            can return to the public site in one click. */}
        <p className="text-[11px] text-gray-500 mt-2">
          Not an admin?{' '}
          <a
            href="/"
            className="text-hd-orange font-subhead uppercase tracking-subhead hover:underline"
          >
            Return to H-D Certified →
          </a>
        </p>
        {/* QA BUG-013: turn off browser autofill on this portal-specific
            login form. Chromium/Safari otherwise fill any saved credential
            into a field with autoComplete="email"/"current-password" — so
            an admin can land here and see their *dealer* credentials
            pre-populated (same eTLD+1). The form-level autoComplete="off"
            plus per-input "off" / "new-password" tokens move the visible
            inputs out of the generic credential-autofill pool, so they
            load empty. */}
        <form
          onSubmit={handleSubmit(onSubmit)}
          className="mt-8 space-y-4"
          autoComplete="off"
        >
          {/* BUG-028: inline validation — errors surface immediately on
              submit attempt and clear as the field is corrected. */}
          <div>
            <label className="block text-xs font-subhead uppercase tracking-subhead text-gray-600 mb-2">
              Email
            </label>
            <Input
              type="email"
              autoComplete="off"
              aria-invalid={Boolean(errors.email)}
              {...register('email', {
                required: 'Email is required',
                pattern: {
                  value: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/,
                  message: 'Please enter a valid email address',
                },
              })}
            />
            {errors.email && (
              <p className="mt-1 text-[11px] text-danger" role="alert">
                {errors.email.message}
              </p>
            )}
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
                autoComplete="new-password"
                className="pr-10"
                aria-invalid={Boolean(errors.password)}
                {...register('password', {
                  required: 'Password is required',
                  minLength: { value: 8, message: 'Password must be at least 8 characters' },
                })}
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
            {errors.password && (
              <p className="mt-1 text-[11px] text-danger" role="alert">
                {errors.password.message}
              </p>
            )}
          </div>
          {/* ENH-001: copy updated to the spec-mandated wording, matching
              the dealer LoginPage banner. */}
          {sessionExpired && !error && (
            <div
              className="text-warning text-sm bg-warning/10 border border-warning/40 px-3 py-2"
              role="status"
              aria-live="polite"
            >
              Your session has expired. Please sign in again.
            </div>
          )}
          {error && <div className="text-danger text-sm">{error}</div>}
          <Button type="submit" className="w-full" disabled={formState.isSubmitting}>
            {formState.isSubmitting ? 'Signing in…' : 'Sign In'}
          </Button>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setForgotOpen(true)}
              className="font-subhead uppercase tracking-subhead text-xs text-hd-orange hover:underline"
            >
              Forgot password?
            </button>
          </div>
        </form>
        {/* QA latest: plaintext demo credentials removed from the admin
            sign-in page entirely — an unauthorised credential leak. */}
      </div>
      <ForgotPasswordModal
        open={forgotOpen}
        onClose={() => {
          setForgotOpen(false);
          // Post-audit: clear any stale "Invalid credentials" banner
          // left over from the prior failed login attempt — by the
          // time the user closes the forgot-password modal that error
          // is no longer relevant and reads as confusing noise.
          setError(null);
        }}
        apiPathPrefix="/auth/admin"
        apiBase={((import.meta.env.VITE_API_URL as string | undefined) ?? '').replace(/\/$/, '') + '/api/v1'}
      />
    </div>
  );
}
