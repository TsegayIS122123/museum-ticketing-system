'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle2 } from 'lucide-react';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { PasswordField } from '@/components/ui/PasswordField';
import { PublicHeader } from '@/components/layout/PublicHeader';
import { resetPassword } from '@/features/account/api';
import { isApiError } from '@/lib/api/errors';

// Consumes the link sent by /_allauth/app/v1/auth/password/request -- and
// reused by platform_admin.create_staff_account for a brand-new Cashier /
// Museum Manager row (FR-ACC-006): `/{lang}/reset-password?token=<key>`.
// Until this form is submitted, an admin-created account has no usable
// password at all (set_unusable_password()). Role-agnostic -- every role's
// reset lands here.
//
// `useSearchParams()` opts this route out of static prerendering unless
// wrapped in a Suspense boundary (see signin/page.tsx for the same pattern).
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
      // allauth returns a 401 "not authenticated" envelope on success (the
      // reset is applied but the user isn't signed in), which headlessRequest
      // treats as success. Only a real error (bad/expired key -> 409, or a
      // password that fails AUTH_PASSWORD_VALIDATORS -> 400) throws here.
      await resetPassword({ key: token, password: newPassword });
      setIsDone(true);
    } catch (err: unknown) {
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
            <h2 className="text-2xl font-serif font-semibold text-stone-900">
              {t('set_password_title') || 'Set Your Password'}
            </h2>
            <p className="text-sm text-stone-500 mt-1">
              {t('set_password_description') || 'Choose a password to activate your account.'}
            </p>
          </div>

          {error && <ErrorBanner message={error} className="mb-4" />}

          {isDone ? (
            <div className="text-center py-4">
              <div className="mb-4 flex justify-center text-green-600">
                <CheckCircle2 className="w-10 h-10" />
              </div>
              <p className="text-stone-700">
                {t('password_set') || 'Your password has been set. You can now sign in.'}
              </p>
              <Link href={`/${locale}/signin`}>
                <Button className="mt-4 w-full bg-brand-primary hover:bg-primary-700">
                  {t('back_to_login') || 'Back to Login'}
                </Button>
              </Link>
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
              <Link href={`/${locale}/signin`}>
                <Button type="button" variant="secondary" className="w-full" disabled={isLoading}>
                  {t('cancel') || 'Cancel'}
                </Button>
              </Link>
            </form>
          )}
        </Card>
      </main>
    </div>
  );
}
