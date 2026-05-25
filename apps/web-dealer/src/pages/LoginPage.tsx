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
  const { register, handleSubmit, formState } = useForm<FormValues>({
    defaultValues: { remember: true },
  });

  const onSubmit = async (values: FormValues) => {
    setError(null);
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

          <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4">
            <div>
              <label className="block text-xs font-subhead uppercase tracking-subhead text-gray-600 mb-2">
                Registered Email
              </label>
              <Input
                autoComplete="username"
                placeholder="vikram@capital-hd.in"
                {...register('username', { required: true, minLength: 3 })}
              />
            </div>
            <div>
              <label className="block text-xs font-subhead uppercase tracking-subhead text-gray-600 mb-2">
                Password
              </label>
              <Input
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                {...register('password', { required: true, minLength: 8 })}
              />
            </div>

            <div className="flex items-center justify-between text-sm">
              <label className="inline-flex items-center gap-2 text-gray-700">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-hd-orange"
                  {...register('remember')}
                />
                <span>Remember me</span>
              </label>
              {/* Self-serve password reset isn't built yet — point the
                  link at a tel: URL + mailto chain via a small popup so a
                  stranded rep has a real recovery path (QA: link must be
                  clickable). Mobile clicks dial directly; desktop offers
                  to open the system phone / mail handler. */}
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

          {/* Demo creds are baked in for local / staging walk-throughs but
              must NOT ship in the production HTML — that's a free credential
              for anyone hitting the page. import.meta.env.DEV is true in
              `pnpm dev` and false in `pnpm build`, so the line drops out
              of the production bundle entirely (tree-shaken, not just
              hidden). */}
          {import.meta.env.DEV && (
            <p className="text-xs text-gray-500 mt-6 text-center">
              Demo: <code className="text-hd-orange">gurgaon-hd</code> / <code className="text-hd-orange">Dealer@123!</code>
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
