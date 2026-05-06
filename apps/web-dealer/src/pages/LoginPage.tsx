import { useState } from 'react';
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
      user: { id: string; role: 'DEALER'; name: string };
    };
    setSession(data);
    navigate('/dashboard');
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-hd-white">
      {/* Left — orange marketing panel */}
      <aside className="relative hidden lg:flex flex-col justify-between bg-hd-orange text-hd-white p-12 overflow-hidden">
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

      {/* Right — sign-in form */}
      <section className="flex items-center justify-center px-6 py-16 lg:py-0">
        <div className="w-full max-w-md">
          <p className="font-subhead uppercase tracking-subhead text-[11px] text-hd-orange">Dealer Portal</p>
          <p className="font-subhead uppercase tracking-subhead text-[11px] text-text-on-light/60 mt-1">Harley-Davidson</p>

          <h2 className="font-headline text-4xl tracking-headline mt-8 uppercase">
            Sign <span className="text-hd-orange">In</span>
          </h2>
          <p className="text-gray-600 text-sm mt-2 leading-relaxed">
            Authorized dealer access only. Contact H-D Admin if your credentials are not active.
          </p>

          <form onSubmit={handleSubmit(onSubmit)} className="mt-8 space-y-5">
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
              <a
                href="#"
                onClick={(e) => e.preventDefault()}
                className="font-subhead uppercase tracking-subhead text-xs text-hd-orange hover:brightness-110"
              >
                Forgot Password?
              </a>
            </div>

            {error && (
              <div className="text-danger text-sm bg-danger/10 border border-danger/30 px-3 py-2 rounded-card">
                {error}
              </div>
            )}

            <Button type="submit" className="w-full !py-4 text-base" disabled={formState.isSubmitting}>
              {formState.isSubmitting ? 'Signing in…' : 'Sign In'}
            </Button>
          </form>

          <p className="text-center font-subhead uppercase tracking-subhead text-[11px] text-gray-500 mt-8">
            Need Help? · +91 98188 00000
          </p>

          <p className="text-xs text-gray-500 mt-10 text-center">
            Demo: <code className="text-hd-orange">gurgaon-hd</code> / <code className="text-hd-orange">Dealer@123!</code>
          </p>
        </div>
      </section>
    </div>
  );
}
