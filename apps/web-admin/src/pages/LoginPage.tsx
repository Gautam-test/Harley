import { useState } from 'react';
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
      user: { id: string; role: 'ADMIN'; name: string };
    };
    setSession(data);
    navigate('/dashboard');
  };

  return (
    <div className="min-h-screen bg-surface-light flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-hd-white border border-gray-200 p-8 shadow-sm rounded-card">
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
            <Input
              type="password"
              autoComplete="current-password"
              {...register('password', { required: true, minLength: 8 })}
            />
          </div>
          {error && <div className="text-danger text-sm">{error}</div>}
          <Button type="submit" className="w-full" disabled={formState.isSubmitting}>
            {formState.isSubmitting ? 'Signing in…' : 'Sign In'}
          </Button>
        </form>
        <p className="text-xs text-gray-500 mt-6">
          Demo: <code className="text-hd-orange">admin@hd-cpo.local</code> / <code className="text-hd-orange">Admin@123!</code>
        </p>
      </div>
    </div>
  );
}
