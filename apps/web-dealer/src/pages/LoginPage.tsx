import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { Button, Input } from '@hd-cpo/ui';
import { useAuthStore } from '../store/auth';

interface FormValues {
  username: string;
  password: string;
  remember: boolean;
}

export function LoginPage() {
  const navigate = useNavigate();
  const setSession = useAuthStore((s) => s.setSession);
  const [error, setError] = useState<string | null>(null);
  // QA latest: inline per-field validation strings shown before API call.
  const [fieldErrors, setFieldErrors] = useState<{ username?: string; password?: string }>({});
  // QA latest: password masking toggle state.
  const [showPassword, setShowPassword] = useState(false);

  // Session-expiry banner — set by api.ts when a 401-after-refresh-fail
  // boots the user back to /login. Cleared on the next successful login
  // OR when the dealer dismisses it. Read once on mount so navigating
  // back to /login from a fresh action doesn't re-fire the toast.
  const [sessionExpired, setSessionExpired] = useState(false);
  useEffect(() => {
    try {
      if (window.sessionStorage.getItem('hd-cpo:session-expired') === '1') {
        setSessionExpired(true);
        window.sessionStorage.removeItem('hd-cpo:session-expired');
      }
    } catch { /* ignore */ }
  }, []);

  // QA: login must be a single fixed view, never scrolls. Tailwind's
  // h-screen + overflow-hidden on a layout div alone wasn't enough on
  // some viewports (mobile address bar / DevTools docked) — body itself
  // would still scroll when form + footer text exceeded available px.
  // Lock html/body overflow on mount and restore on unmount so other
  // pages keep their normal scroll behaviour.
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prevHtml = html.style.overflow;
    const prevBody = body.style.overflow;
    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    return () => {
      html.style.overflow = prevHtml;
      body.style.overflow = prevBody;
    };
  }, []);

  // QA latest: "Remember me" must load UNCHECKED (was `remember: true`).
  const { register, handleSubmit, formState } = useForm<FormValues>({
    defaultValues: { remember: false },
  });

  const onSubmit = async (values: FormValues) => {
    setError(null);
    // QA latest: client-side required validation with dedicated per-field
    // messages BEFORE hitting the API.
    //   • empty email/username → "Please enter your email"
    //   • email present but no password → "Please enter your password"
    const nextErrors: { username?: string; password?: string } = {};
    const trimmedUser = values.username.trim();
    // QA BUG-006: require a syntactically valid email before hitting the
    // API. Standard RFC-5322-ish regex (local@domain.tld, ≥2-char TLD).
    // Catches "vikram" / "vikram@" / "vikram@x" / "vikram@x.c" — the API
    // would have returned a generic "Login failed" for these, leaving
    // dealers thinking the password was wrong instead of the email typo.
    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    if (!trimmedUser) nextErrors.username = 'Please enter your email';
    else if (!EMAIL_RE.test(trimmedUser))
      nextErrors.username = 'Please enter a valid email address.';
    if (!values.password) nextErrors.password = 'Please enter your password';
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    const apiBase = ((import.meta.env.VITE_API_URL as string | undefined) ?? '').replace(/\/$/, '') + '/api/v1';
    const res = await fetch(`${apiBase}/auth/dealer/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: values.username, password: values.password }),
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
      user: { id: string; role: 'DEALER'; name: string };
    };
    setSession(data);
    navigate('/dashboard');
  };

  return (
    // fixed inset-0 pins the layout to the viewport so it cannot push
    // body height beyond 100vh — combined with the html/body overflow
    // lock above, this guarantees the login page is a single fixed view
    // on every device (QA fix). The form column has overflow-y-auto as
    // a last-resort safety net for sub-600px-tall viewports (landscape
    // phones); desktop and tablet never reach it.
    <div className="fixed inset-0 grid lg:grid-cols-2 bg-hd-white">
      {/* Left — orange marketing panel */}
      <aside className="relative hidden lg:flex flex-col justify-between bg-hd-orange text-hd-black p-12 overflow-hidden">
        <div className="absolute inset-0 opacity-15 bg-[radial-gradient(ellipse_at_bottom_right,_rgba(0,0,0,0.6),_transparent_60%)]" />
        <div className="relative z-10">
          <p className="font-subhead uppercase tracking-subhead text-xs border-t border-hd-white/70 pt-3 inline-block">
            Dealer Portal
          </p>
        </div>
        <div className="relative z-10">
          <h1 className="font-headline text-5xl xl:text-6xl tracking-headline leading-[0.95] uppercase">
            <span className="block">Manage</span>
            <span className="block">The Ride.</span>
            <span className="block text-hd-black">Every Mile.</span>
          </h1>
        </div>
        <p className="relative z-10 font-subhead uppercase tracking-subhead text-[11px] text-hd-white/80">
          © 2026 Harley-Davidson · Authorized Dealer Access Only
        </p>
      </aside>

      {/* Right — sign-in form. overflow-y-auto here is a safety net only:
          if the column's content ever exceeds its viewport-height cell
          (extremely short landscape phone), the form scrolls inside the
          column instead of the whole page. Desktop/tablet never trigger it. */}
      <section className="flex items-center justify-center px-6 py-8 lg:py-6 overflow-y-auto">
        <div className="w-full max-w-md">
          <p className="font-subhead uppercase tracking-subhead text-[11px] text-hd-orange">Dealer Portal</p>
          <p className="font-subhead uppercase tracking-subhead text-[11px] text-text-on-light/60 mt-1">Harley-Davidson</p>

          <h2 className="font-headline text-4xl tracking-headline mt-6 uppercase">
            Sign <span className="text-hd-orange">In</span>
          </h2>
          <p className="text-gray-600 text-sm mt-2 leading-relaxed">
            Authorized dealer access only. Contact H-D Admin if your credentials are not active.
          </p>

          {/* QA BUG-013: disable browser autofill — dealers were seeing
              their admin credentials pre-populated (and vice-versa) on
              shared machines because Chromium/Safari fill any saved cred
              into autoComplete="username"/"current-password" inputs on
              the same eTLD+1. Form-level autoComplete="off" plus per-
              input "off" / "new-password" tokens move the visible inputs
              out of the generic credential-autofill pool, so they load
              empty. */}
          <form
            onSubmit={handleSubmit(onSubmit)}
            className="mt-6 space-y-4"
            noValidate
            autoComplete="off"
          >
            <div>
              <label className="block text-xs font-subhead uppercase tracking-subhead text-gray-600 mb-2">
                Registered Email
              </label>
              <Input
                autoComplete="off"
                placeholder="vikram@capital-hd.in"
                aria-invalid={Boolean(fieldErrors.username)}
                {...register('username', {
                  onChange: () => setFieldErrors((p) => ({ ...p, username: undefined })),
                })}
              />
              {fieldErrors.username && (
                <p className="mt-1 text-xs text-danger" role="alert">
                  {fieldErrors.username}
                </p>
              )}
            </div>
            <div>
              <label className="block text-xs font-subhead uppercase tracking-subhead text-gray-600 mb-2">
                Password
              </label>
              {/* QA latest: relative wrapper so the eye toggle sits inside
                  the input on the right edge. */}
              <div className="relative">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  placeholder="••••••••"
                  aria-invalid={Boolean(fieldErrors.password)}
                  className="pr-10"
                  {...register('password', {
                    onChange: () => setFieldErrors((p) => ({ ...p, password: undefined })),
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
              {fieldErrors.password && (
                <p className="mt-1 text-xs text-danger" role="alert">
                  {fieldErrors.password}
                </p>
              )}
            </div>

            <div className="flex items-center justify-between text-sm">
              {/* QA latest: loads UNCHECKED (defaultValues.remember = false). */}
              <label className="inline-flex items-center gap-2 text-gray-700">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-hd-orange"
                  {...register('remember')}
                />
                <span>Remember me</span>
              </label>
              <button
                type="button"
                onClick={() => {
                  const ok = window.confirm(
                    'Self-serve password reset is coming soon.\n\nFor now, contact H-D Certified support to reset your password:\n  · Phone: +91 98188 00000\n  · Email: support@hd-certified.in\n\nClick OK to call now.',
                  );
                  if (ok) window.location.href = 'tel:+919818800000';
                }}
                className="font-subhead uppercase tracking-subhead text-xs text-hd-orange hover:underline"
              >
                Forgot password?
              </button>
            </div>

            {sessionExpired && !error && (
              <div className="text-warning text-sm bg-warning/10 border border-warning/40 px-3 py-2 font-subhead uppercase tracking-subhead text-xs">
                Session timed out
              </div>
            )}
            {error && (
              <div className="text-danger text-sm bg-danger/10 border border-danger/30 px-3 py-2">
                {error}
              </div>
            )}

            <Button type="submit" className="w-full !py-4 text-base" disabled={formState.isSubmitting}>
              {formState.isSubmitting ? 'Signing in…' : 'Sign In'}
            </Button>
          </form>

          <p className="text-center font-subhead uppercase tracking-subhead text-[11px] text-gray-500 mt-6">
            Need Help? · +91 98188 00000
          </p>

          {/* QA latest: demo credentials removed from the dealer sign-in
              page entirely (was previously DEV-guarded but still present
              in source). No plaintext credential block ships in any
              environment now — matches the admin sign-in treatment. */}
        </div>
      </section>
    </div>
  );
}
