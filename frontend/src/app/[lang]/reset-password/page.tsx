'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle2 } from 'lucide-react';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { PasswordField } from '@/components/ui/PasswordField';
import { PublicHeader } from '@/components/layout/PublicHeader';
import { staffResetPassword } from '@/features/account/api';
import { isApiError } from '@/lib/api/errors';

// Consumes the link sent by POST /auth/forgot-password/ (and reused by
// platform_admin.create_staff_account for a brand-new Cashier/Museum
// Manager row -- FR-ACC-002/FR-ACC-006): `{PUBLIC_WEB_BASE_URL}/reset-password?token=...`.
// This is the *only* place that token is ever redeemed -- until this
// form is submitted, the account has no usable password at all
// (`set_unusable_password()`), which is what the Admin's "pending"-style
// badge is actually reflecting.
//
// `useSearchParams()` opts this route out of static prerendering unless
// wrapped in a Suspense boundary (see [lang]/book/confirmation/page.tsx
// for the same pattern) -- without it `next build` fails on this route.
export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex flex-col" data-surface="visitor">
          <PublicHeader />
          <main className="flex-1 flex items-center justify-center">
            <div className="text-stone-500">Loading…</div>
          </main>
        </div>
      }
    >
      <ResetPasswordPageContent />
    </Suspense>
  );
}

function ResetPasswordPageContent() {
  const { t, locale } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDone, setIsDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!token) {
      setError(
        t('reset_link_invalid') ||
          'This link is missing its token. Please use the link from your email exactly as sent.'
      );
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(t('passwords_do_not_match') || 'Passwords do not match.');
      return;
    }

    setIsLoading(true);
    try {
      await staffResetPassword({ token, new_password: newPassword });
      setIsDone(true);
    } catch (err: unknown) {
      // The backend only blames the token/link itself for a real reason
      // (services.reset_password's "Invalid or expired reset token.").
      // Any other failure -- most commonly a password that failed
      // AUTH_PASSWORD_VALIDATORS (too short, too common, all-numeric, too
      // similar to the account's own email) -- has nothing to do with the
      // link, so show the real API message instead of misleadingly
      // blaming it every time.
      if (isApiError(err) && err.message) {
        setError(err.message);
      } else {
        setError(
          t('reset_password_failed') ||
            'This link is invalid or has expired. Request a new one and try again.'
        );
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col" data-surface="visitor">
      <PublicHeader />
      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <Card className="max-w-md w-full">
          <div className="text-center mb-6">
            <h2 className="text-2xl font-serif font-bold text-stone-900">
              {t('set_password') || 'Set Your Password'}
            </h2>
            <p className="text-sm text-stone-500 mt-1">
              {t('set_password_description') ||
                'Choose a password to activate your staff account.'}
            </p>
          </div>

          {error && <ErrorBanner message={error} className="mb-4" />}

          {isDone ? (
            <div className="text-center py-4">
              <div className="text-4xl mb-4 flex justify-center text-green-600">
                <CheckCircle2 className="w-10 h-10" />
              </div>
              <p className="text-stone-700">
                {t('password_set') || 'Your password has been set. You can now sign in.'}
              </p>
              <Button
                className="mt-4 w-full bg-brand-primary hover:bg-primary-700"
                onClick={() => router.push(`/${locale}/staff/login`)}
              >
                {t('back_to_login') || 'Back to Login'}
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <PasswordField
                id="new-password"
                label={t('new_password') || 'New Password'}
                placeholder="••••••••"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                autoComplete="new-password"
              />

              <PasswordField
                id="confirm-password"
                label={t('confirm_password') || 'Confirm Password'}
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                autoComplete="new-password"
              />

              <Button
                type="submit"
                size="lg"
                className="w-full bg-brand-primary hover:bg-primary-700"
                disabled={isLoading}
              >
                {isLoading ? t('loading') : t('set_password') || 'Set Password'}
              </Button>
              <Button
                type="button"
                variant="secondary"
                className="w-full"
                onClick={() => router.push(`/${locale}/staff/login`)}
                disabled={isLoading}
              >
                {t('cancel') || 'Cancel'}
              </Button>
            </form>
          )}
        </Card>
      </main>
    </div>
  );
}
