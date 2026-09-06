'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { confirmEmailVerification } from '../api';
import { ApiError } from '@/lib/api/errors';

type Status = 'verifying' | 'success' | 'error';

export function VerifyEmailStatus() {
  const { t, locale } = useTranslation();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [status, setStatus] = useState<Status>('verifying');
  const [error, setError] = useState<string | null>(null);
  // The link can only be safely consumed once (StrictMode/dev double-render
  // guard) -- the backend endpoint isn't necessarily idempotent for an
  // already-consumed token, so this avoids firing the request twice.
  const hasRun = useRef(false);

  useEffect(() => {
    if (hasRun.current) return;
    hasRun.current = true;

    void (async () => {
      if (!token) {
        setStatus('error');
        setError(t('verify_email_missing_token') || 'This verification link is missing its token.');
        return;
      }

      try {
        await confirmEmailVerification(token);
        setStatus('success');
      } catch (err: unknown) {
        setStatus('error');
        setError(
          err instanceof ApiError
            ? err.message
            : t('verify_email_failed') || 'This link is invalid or has expired.'
        );
      }
    })();
  }, [token, t]);

  return (
    <Card className="max-w-md mx-auto text-center">
      <div className="w-12 h-12 bg-primary-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
        <span className="text-white font-bold text-xl">SM</span>
      </div>

      {status === 'verifying' && (
        <>
          <h2 className="text-2xl font-serif font-bold text-stone-900">
            {t('verify_email_verifying') || 'Verifying your email…'}
          </h2>
          <p className="text-sm text-stone-500 mt-1">{t('loading')}</p>
        </>
      )}

      {status === 'success' && (
        <>
          <h2 className="text-2xl font-serif font-bold text-stone-900">
            {t('verify_email_success') || 'Email verified'}
          </h2>
          <p className="text-sm text-stone-500 mt-1 mb-6">
            {t('verify_email_success_body') ||
              'Your email address has been confirmed. You can close this page.'}
          </p>
          <Link href={`/${locale}/bookings`}>
            <Button size="lg" className="w-full bg-brand-primary hover:bg-primary-700">
              {t('view_bookings') || 'View my bookings'}
            </Button>
          </Link>
        </>
      )}

      {status === 'error' && (
        <>
          <h2 className="text-2xl font-serif font-bold text-stone-900 mb-4">
            {t('verify_email_error_title') || 'Verification failed'}
          </h2>
          {error && <ErrorBanner message={error} dismissible={false} className="mb-4 text-left" />}
          <Link href={`/${locale}/verify`}>
            <Button variant="ghost" size="sm" className="w-full text-stone-500">
              {t('back_to_verify') || 'Back to verification'}
            </Button>
          </Link>
        </>
      )}
    </Card>
  );
}
