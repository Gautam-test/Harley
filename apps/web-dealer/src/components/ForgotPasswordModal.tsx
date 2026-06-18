import { useEffect, useRef, useState } from 'react';
import { Button, Input } from '@hd-cpo/ui';

// 3-step forgot-password OTP flow shared by the dealer + admin login
// pages. Step 1 collects the email, step 2 a 6-digit code, step 3 a
// new password. The role prop drives the API path prefix and the copy
// (we don't want to ship one component that says "DEALER" on the
// admin login).
//
// State machine is intentionally in-component (not Zustand / form lib)
// — this modal is tiny, opens-fills-closes, and never needs to share
// state with anything else.

type Step = 'email' | 'verify' | 'reset' | 'done';

interface Props {
  open: boolean;
  onClose: () => void;
  /** API path prefix — '/auth/dealer' or '/auth/admin'. Keeps the
   *  component decoupled from each SPA's exact api wrapper. */
  apiPathPrefix: '/auth/dealer' | '/auth/admin';
  /** Vite-defined base URL of the API (e.g. import.meta.env.VITE_API_URL). */
  apiBase: string;
}

interface ErrorBody {
  error?: { code: string; message: string };
}

async function post<T>(url: string, body: object): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as ErrorBody | null;
    throw new Error(data?.error?.message ?? `Request failed (${res.status})`);
  }
  return (await res.json()) as T;
}

export function ForgotPasswordModal({ open, onClose, apiPathPrefix, apiBase }: Props) {
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [otpId, setOtpId] = useState('');
  const [code, setCode] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  // Resend cooldown countdown (seconds remaining). Matches the
  // server-side 30s cooldown so we can disable the resend button
  // until the user is allowed to retry.
  const [resendIn, setResendIn] = useState(0);
  const codeInputRef = useRef<HTMLInputElement>(null);

  // Reset all state when the modal closes — so reopening starts fresh.
  useEffect(() => {
    if (!open) {
      setStep('email');
      setEmail('');
      setOtpId('');
      setCode('');
      setResetToken('');
      setNewPassword('');
      setConfirmPassword('');
      setError(null);
      setInfo(null);
      setBusy(false);
      setResendIn(0);
    }
  }, [open]);

  // Auto-focus the OTP input when entering the verify step. UX detail
  // — saves the user a click on what's almost always a numeric key
  // pad on mobile.
  useEffect(() => {
    if (step === 'verify') codeInputRef.current?.focus();
  }, [step]);

  // ESC closes the modal at any step.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Resend countdown tick.
  useEffect(() => {
    if (resendIn <= 0) return;
    const t = window.setTimeout(() => setResendIn((n) => Math.max(0, n - 1)), 1000);
    return () => window.clearTimeout(t);
  }, [resendIn]);

  if (!open) return null;

  const trimmedEmail = email.trim().toLowerCase();
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmedEmail);
  const passwordsMatch = newPassword === confirmPassword;
  const passwordValid = newPassword.length >= 8 && newPassword.length <= 128;

  const sendCode = async () => {
    if (!emailValid) {
      setError('Please enter a valid email address.');
      return;
    }
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const r = await post<{ otpId: string; expiresInSeconds: number }>(
        `${apiBase}${apiPathPrefix}/forgot-password/send`,
        { email: trimmedEmail },
      );
      setOtpId(r.otpId);
      setStep('verify');
      setInfo(
        `A 6-digit code has been emailed to ${trimmedEmail}. Check your inbox (and spam).`,
      );
      setResendIn(30);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send code');
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    if (resendIn > 0) return;
    setBusy(true);
    setError(null);
    try {
      const r = await post<{ otpId: string }>(
        `${apiBase}${apiPathPrefix}/forgot-password/send`,
        { email: trimmedEmail },
      );
      setOtpId(r.otpId);
      setInfo('New code sent. Check your inbox.');
      setResendIn(30);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Resend failed');
    } finally {
      setBusy(false);
    }
  };

  const verifyCode = async () => {
    if (!/^\d{6}$/.test(code)) {
      setError('Enter the 6-digit code from your email.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await post<{ resetToken: string }>(
        `${apiBase}${apiPathPrefix}/forgot-password/verify`,
        { otpId, code },
      );
      setResetToken(r.resetToken);
      setStep('reset');
      setInfo(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Verification failed');
    } finally {
      setBusy(false);
    }
  };

  const submitNewPassword = async () => {
    if (!passwordValid) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (!passwordsMatch) {
      setError('Passwords do not match.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await post(`${apiBase}${apiPathPrefix}/forgot-password/reset`, {
        resetToken,
        newPassword,
      });
      setStep('done');
      setInfo('Password updated. You can now sign in with the new password.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Password update failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Forgot password"
      className="fixed inset-0 z-[100] bg-black/60 flex items-center justify-center px-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-hd-white border border-gray-200 p-6 sm:p-8 shadow-xl"
      >
        <div className="flex items-start justify-between gap-4 mb-4">
          <h2 className="font-headline text-2xl tracking-headline uppercase text-text-on-light">
            {step === 'done' ? 'All set' : 'Reset password'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-gray-400 hover:text-text-on-light text-xl leading-none"
          >
            ✕
          </button>
        </div>

        {step === 'email' && (
          <>
            <p className="text-sm text-gray-600 mb-4">
              Enter your registered email. We'll send a 6-digit code to verify it's you.
            </p>
            <label className="block text-xs font-subhead uppercase tracking-subhead text-gray-600 mb-2">
              Registered Email
            </label>
            <Input
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                // Clear the API not-found error as soon as the user
                // edits the field — gives instant feedback that they're
                // correcting the typo.
                if (error) setError(null);
              }}
              placeholder="Email address"
              autoComplete="off"
              autoFocus
              aria-invalid={Boolean(error)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && emailValid && !busy) sendCode();
              }}
            />
            {/* Inline field error per QA spec — red text directly
                under the Registered Email input. Covers
                USER_NOT_FOUND, OTP_LIMIT_REACHED, rate-limit, etc.
                Pulls error out of the generic banner so this step
                shows it where the user is looking. */}
            {error && (
              <p className="mt-1 text-[11px] text-danger" role="alert">
                {error}
              </p>
            )}
            <Button
              type="button"
              onClick={sendCode}
              disabled={!emailValid || busy}
              className="w-full mt-4"
            >
              {busy ? 'Sending…' : 'Send Code'}
            </Button>
          </>
        )}

        {step === 'verify' && (
          <>
            <p className="text-sm text-gray-600 mb-4">
              Enter the 6-digit code emailed to <strong>{trimmedEmail}</strong>. The
              code expires in 10 minutes.
            </p>
            <label className="block text-xs font-subhead uppercase tracking-subhead text-gray-600 mb-2">
              Verification Code
            </label>
            <Input
              ref={codeInputRef}
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="6-digit code"
              autoComplete="one-time-code"
              className="font-mono text-center text-lg tracking-[0.5em]"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && /^\d{6}$/.test(code) && !busy) verifyCode();
              }}
            />
            <Button
              type="button"
              onClick={verifyCode}
              disabled={!/^\d{6}$/.test(code) || busy}
              className="w-full mt-4"
            >
              {busy ? 'Verifying…' : 'Verify Code'}
            </Button>
            <div className="flex items-center justify-between mt-3 text-xs">
              <button
                type="button"
                onClick={() => setStep('email')}
                className="text-gray-500 hover:underline"
              >
                ← Change email
              </button>
              <button
                type="button"
                onClick={resend}
                disabled={resendIn > 0 || busy}
                className="font-subhead uppercase tracking-subhead text-hd-orange hover:underline disabled:text-gray-400 disabled:no-underline"
              >
                {resendIn > 0 ? `Resend in ${resendIn}s` : 'Resend code'}
              </button>
            </div>
          </>
        )}

        {step === 'reset' && (
          <>
            <p className="text-sm text-gray-600 mb-4">
              Code verified. Set a new password (minimum 8 characters).
            </p>
            <label className="block text-xs font-subhead uppercase tracking-subhead text-gray-600 mb-2">
              New Password
            </label>
            <Input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              autoFocus
            />
            <label className="block text-xs font-subhead uppercase tracking-subhead text-gray-600 mb-2 mt-3">
              Confirm Password
            </label>
            <Input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              onKeyDown={(e) => {
                if (
                  e.key === 'Enter' &&
                  passwordValid &&
                  passwordsMatch &&
                  !busy
                )
                  submitNewPassword();
              }}
            />
            {confirmPassword && !passwordsMatch && (
              <p className="text-[11px] text-danger mt-1">Passwords don't match.</p>
            )}
            <Button
              type="button"
              onClick={submitNewPassword}
              disabled={!passwordValid || !passwordsMatch || busy}
              className="w-full mt-4"
            >
              {busy ? 'Updating…' : 'Update Password'}
            </Button>
          </>
        )}

        {step === 'done' && (
          <>
            <div className="bg-success/10 border border-success/30 text-success px-3 py-3 text-sm mb-4">
              {info ?? 'Password updated.'}
            </div>
            <Button type="button" onClick={onClose} className="w-full">
              Back to Sign In
            </Button>
          </>
        )}

        {info && step !== 'done' && (
          <p className="mt-3 text-[12px] text-gray-600 leading-snug">{info}</p>
        )}
        {/* Generic error banner — suppressed on the email step because
            we render the same error inline under the email field there
            (per BUG spec). Verify / reset steps still surface errors here. */}
        {error && step !== 'email' && (
          <div className="mt-3 bg-danger/10 border border-danger/30 text-danger px-3 py-2 text-sm">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
