'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { useAuth } from '@/lib/auth/auth-context';
import { getPostLoginPath } from '@/lib/auth/roles';
import {
  clearRememberedRedirect,
  peekRememberedRedirect,
  rememberRedirect,
  safeRedirectPath,
} from '@/lib/utils/redirect';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { PasswordField } from '@/components/ui/PasswordField';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { login as loginRequest } from '../api';

// FR-ACC-002 / FR-ACC-005: the single front door. Every role -- visitor,
// cashier, museum_manager, platform_admin -- signs in here with email +
// password. The server returns the account's `role` and this component does
// the routing (getPostLoginPath); there is no separate staff login page.
export function SignInForm() {
  const { t, locale } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login } = useAuth();

  // "Book a visit" / "School visit" bounce signed-out visitors here with
  // `?redirect=/book`, and a visitor who left for the verification email may
  // come back without the query string -- so the target is also remembered
  // (same helper the old verify flow used).
  const redirectParam = searchParams.get('redirect') ?? searchParams.get('next');
  const requestedRedirect = safeRedirectPath(redirectParam, locale);
  useEffect(() => {
    if (requestedRedirect) rememberRedirect(requestedRedirect);
  }, [requestedRedirect]);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email || !password) {
      setError(t('email_password_required') || 'Please enter both email and password.');
      return;
    }

    setIsLoading(true);
    try {
      const response = await loginRequest({ email, password });
      login({ access_token: response.access_token }, response.user);

      // Prefer an explicit/remembered destination (a visitor heading for
      // /book), then fall back to the role's home. safeRedirectPath already
      // refuses /staff/* so a staff account can't be redirected off its
      // dashboard by a crafted ?redirect=.
      const destination =
        requestedRedirect ??
        safeRedirectPath(peekRememberedRedirect(), locale) ??
        getPostLoginPath(locale, response.user.role);
      clearRememberedRedirect();
      router.push(destination);
    } catch {
      // Deliberately generic: never reveal whether the email exists
      // (no account enumeration), matching the backend's single message.
      setError(t('invalid_credentials') || 'Invalid email or password.');
    } finally {
      setIsLoading(false);
    }
  };

  const registerHref = requestedRedirect
    ? `/${locale}/register?redirect=${encodeURIComponent(redirectParam ?? '')}`
    : `/${locale}/register`;

  return (
    <Card className="max-w-md mx-auto w-full">
      <div className="text-center mb-6">
        <h2 className="text-2xl font-serif font-semibold text-stone-900">
          {t('sign_in') || 'Sign In'}
        </h2>
        <p className="text-sm text-stone-500 mt-1">
          {t('welcome_back') || 'Welcome back'}
        </p>
      </div>

      {error && <ErrorBanner message={error} className="mb-4" />}

      <form onSubmit={handleSubmit} className="space-y-4">
        <TextField
          id="email"
          label={t('email') || 'Email'}
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
        />

        <PasswordField
          id="password"
          label={t('password') || 'Password'}
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
        />

        <div className="text-right">
          <Link
            href={`/${locale}/forgot-password`}
            className="text-sm text-brand-primary hover:underline"
          >
            {t('forgot_password') || 'Forgot password?'}
          </Link>
        </div>

        <Button
          type="submit"
          size="lg"
          className="w-full bg-brand-primary hover:bg-primary-700"
          disabled={isLoading}
        >
          {isLoading ? t('loading') || 'Loading...' : t('sign_in') || 'Sign In'}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-stone-500">
        {t('no_account_yet') || "Don't have an account?"}{' '}
        <Link href={registerHref} className="font-semibold text-brand-primary hover:underline">
          {t('sign_up') || 'Create account'}
        </Link>
      </p>
    </Card>
  );
}
