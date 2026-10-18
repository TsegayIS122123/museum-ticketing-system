'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle2, Mail, RefreshCw } from 'lucide-react';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { useAuth } from '@/lib/auth/auth-context';
import {
  clearRememberedRedirect,
  peekRememberedRedirect,
  rememberRedirect,
  safeRedirectPath,
} from '@/lib/utils/redirect';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { isApiError } from '@/lib/api/errors';
import {
  clearHeadlessSession,
  getCurrentUser,
  readHeadlessSession,
  resendVerificationEmail,
  verifyEmail,
} from '../api';
import { verifyEmailCodeSchema } from '../schemas';

type Status = 'code' | 'verifying' | 'success';

// FR-ACC-003 (revised): the verification email carries a 6-digit code. This
// page is the code-entry screen; it also still redeems a `?token=` value
// (`/{lang}/verify-email?token=<key>`, HEADLESS_FRONTEND_URLS in settings)
// when one is present, though the shipped email contains only the code.
// "Resend" re-issues the email (allauth's email/verify/resend, which takes
// no body and resumes the pending flow from the stashed session_token).
//
// allauth's app client is token-based, so this page needs the
// `meta.session_token` minted at signup (features/account/api.ts,
// rememberHeadlessSession). If it's gone (different browser/tab, storage
// cleared) the flow can't be resumed -- that's surfaced with a clear path
// back to sign-in instead of a dead form.
export function VerifyEmailForm() {
  const { t, locale } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated, setUser } = useAuth();

  const linkToken = searchParams.get('token') ?? '';
  const redirectParam = searchParams.get('redirect') ?? searchParams.get('next');
  const requestedRedirect = safeRedirectPath(redirectParam, locale);
  useEffect(() => {
    if (requestedRedirect) rememberRedirect(requestedRedirect);
  }, [requestedRedirect]);

  // Read once -- the token must not change under us if the effect re-runs.
  const [session] = useState(() => readHeadlessSession());
  const sessionToken = session?.sessionToken ?? null;
  const pendingEmail = session?.email ?? '';

  // Start in the "verifying" state when an emailed link is present, so the
  // auto-redeem effect below doesn't have to call setState on mount.
  const [status, setStatus] = useState<Status>(() =>
    linkToken && sessionToken ? 'verifying' : 'code'
  );
  const [code, setCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const hasAutoVerified = useRef(false);

  const destination =
    requestedRedirect ?? safeRedirectPath(peekRememberedRedirect(), locale) ?? `/${locale}/bookings`;

  const finishVerified = async () => {
    clearHeadlessSession();
    // If a session already exists (a signed-in-but-unverified account),
    // refresh the profile so email_verified_at is current and return to
    // where they were headed.
    if (isAuthenticated) {
      try {
        const updated = await getCurrentUser();
        setUser(updated);
      } catch {
        // Non-fatal -- the success panel still works.
      }
    }
    setStatus('success');
  };

  const redeem = async (key: string) => {
    if (!sessionToken) return;
    setError(null);
    setNotice(null);
    setIsLoading(true);
    try {
      await verifyEmail({ key, sessionToken });
      await finishVerified();
    } catch (err: unknown) {
      setError(
        isApiError(err) && err.message
          ? err.message
          : t('verify_email_failed') || 'This code is invalid or has expired.'
      );
      setStatus('code');
    } finally {
      setIsLoading(false);
    }
  };

  // Auto-redeem an emailed link on arrival. Kept separate from `redeem` so
  // no state is set synchronously during the effect (the "verifying" UI is
  // already shown via the `status` initializer above); every setState here
  // runs after the first `await`.
  const autoRedeem = async (key: string) => {
    if (!sessionToken) return;
    try {
      await verifyEmail({ key, sessionToken });
      await finishVerified();
    } catch (err: unknown) {
      setError(
        isApiError(err) && err.message
          ? err.message
          : t('verify_email_failed') || 'This code is invalid or has expired.'
      );
      setStatus('code');
    }
  };

  useEffect(() => {
    if (hasAutoVerified.current) return;
    if (!linkToken || !sessionToken) return;
    hasAutoVerified.current = true;
    void (async () => {
      await autoRedeem(linkToken);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkToken, sessionToken]);

  const handleSubmitCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = verifyEmailCodeSchema.safeParse({ code });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message || t('otp_invalid_length') || 'Enter the 6-digit code.');
      return;
    }
    await redeem(code);
  };

  const handleResend = async () => {
    if (!sessionToken) return;
    setError(null);
    setNotice(null);
    setIsLoading(true);
    try {
      await resendVerificationEmail(sessionToken);
      setNotice(t('verify_email_pending_resent') || 'Verification email resent.');
    } catch (err: unknown) {
      setError(
        isApiError(err) && err.message
          ? err.message
          : t('password_reset_failed') || 'Unable to resend right now. Please try again.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  if (status === 'verifying') {
    return (
      <Card className="max-w-md mx-auto text-center">
        <h2 className="text-2xl font-serif font-semibold text-stone-900">
          {t('verify_email_verifying') || 'Verifying your email…'}
        </h2>
        <p className="text-sm text-stone-500 mt-1">{t('loading')}</p>
      </Card>
    );
  }

  if (status === 'success') {
    return (
      <Card className="max-w-md mx-auto text-center">
        <div className="mb-4 flex justify-center text-green-600">
          <CheckCircle2 className="w-10 h-10" />
        </div>
        <h2 className="text-2xl font-serif font-semibold text-stone-900">
          {t('verify_email_success') || 'Email verified'}
        </h2>
        <p className="text-sm text-stone-500 mt-1 mb-6">
          {t('verify_email_success_body') ||
            'Your email address has been confirmed. You can close this page.'}
        </p>
        {isAuthenticated ? (
          <Button
            size="lg"
            className="w-full bg-brand-primary hover:bg-primary-700"
            onClick={() => {
              clearRememberedRedirect();
              router.push(destination);
            }}
          >
            {t('continue') || 'Continue'}
          </Button>
        ) : (
          <Link href={`/${locale}/signin`}>
            <Button size="lg" className="w-full bg-brand-primary hover:bg-primary-700">
              {t('sign_in') || 'Sign In'}
            </Button>
          </Link>
        )}
      </Card>
    );
  }

  // No pending flow to resume (session token gone) and no link to redeem --
  // point the user at a path that will work rather than an unusable form.
  if (!sessionToken && !linkToken) {
    return (
      <Card className="max-w-md mx-auto text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-brand-primary/10">
          <Mail className="h-6 w-6 text-brand-primary" />
        </div>
        <h2 className="text-2xl font-serif font-semibold text-stone-900">
          {t('verify_email_pending_title') || 'Confirm your email'}
        </h2>
        <p className="text-sm text-stone-500 mt-2 mb-6">
          {t('verify_email_no_session') ||
            "We couldn't find a verification in progress in this browser. Sign in to continue, or open the link from your email."}
        </p>
        <Link href={`/${locale}/signin`}>
          <Button size="lg" className="w-full bg-brand-primary hover:bg-primary-700">
            {t('sign_in') || 'Sign In'}
          </Button>
        </Link>
      </Card>
    );
  }

  return (
    <Card className="max-w-md mx-auto">
      <div className="text-center mb-6">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-brand-primary/10">
          <Mail className="h-6 w-6 text-brand-primary" />
        </div>
        <h2 className="text-2xl font-serif font-semibold text-stone-900">
          {t('verify_email_pending_title') || 'Confirm your email'}
        </h2>
        <p className="text-sm text-stone-500 mt-2">
          {t('verify_email_code_hint') || 'Enter the 6-digit code from the email we sent'} 
          {pendingEmail ? (
            <>
              {' '}
              <span className="font-semibold text-stone-700">{pendingEmail}</span>
            </>
          ) : (
            '.'
          )}
        </p>
      </div>

      {error && <ErrorBanner message={error} className="mb-4" />}
      {notice && !error && (
        <div className="mb-4 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{notice}</div>
      )}

      <form onSubmit={handleSubmitCode} className="space-y-4">
        <TextField
          id="code"
          label={t('otp_code') || 'Verification Code'}
          type="text"
          inputMode="numeric"
          placeholder="123456"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          maxLength={6}
          required
          className="text-center text-2xl tracking-widest"
        />

        <Button
          type="submit"
          size="lg"
          className="w-full bg-brand-primary hover:bg-primary-700"
          disabled={isLoading || !sessionToken}
        >
          {isLoading ? t('loading') : t('verify') || 'Verify'}
        </Button>

        {sessionToken && (
          <Button
            type="button"
            variant="secondary"
            size="lg"
            className="w-full"
            disabled={isLoading}
            onClick={handleResend}
          >
            <RefreshCw className="w-4 h-4" /> {t('verify_email_pending_resend') || 'Resend email'}
          </Button>
        )}
      </form>
    </Card>
  );
}
