'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { rememberRedirect, safeRedirectPath } from '@/lib/utils/redirect';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { PasswordField } from '@/components/ui/PasswordField';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { isApiError } from '@/lib/api/errors';
import { rememberHeadlessSession, signUp } from '../api';
import { signUpSchema } from '../schemas';

// Self-registration (FR-ACC-001, revised). Creates the Account through
// django-allauth's headless app client and immediately emails BOTH a 6-digit
// code and a confirmation link. The account is not signed in yet -- allauth
// parks it in the "verify_email" flow and returns a `meta.session_token`,
// which is stashed so the verify-email page can continue the same flow.
// (Self-registration only ever produces a visitor; staff are made by an
// admin -- see features/staff or platform_admin.)
export function SignUpForm() {
  const { t, locale } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();

  const redirectParam = searchParams.get('redirect') ?? searchParams.get('next');
  const requestedRedirect = safeRedirectPath(redirectParam, locale);
  useEffect(() => {
    if (requestedRedirect) rememberRedirect(requestedRedirect);
  }, [requestedRedirect]);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFieldErrors({});

    const parsed = signUpSchema.safeParse({ email, full_name: fullName, password, confirmPassword });
    if (!parsed.success) {
      const flat: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? 'form');
        if (!flat[key]) flat[key] = issue.message;
      }
      setFieldErrors(flat);
      setError(t('signup_invalid') || 'Please fix the highlighted fields and try again.');
      return;
    }

    if (!fullName.trim()) {
      setFieldErrors({ full_name: t('full_name_required') || 'Please enter your full name.' });
      return;
    }

    setIsLoading(true);
    try {
      const envelope = await signUp({
        email: parsed.data.email,
        full_name: fullName.trim(),
        password: parsed.data.password,
      });

      // Continue the pending verification flow on /verify-email. A duplicate
      // email intentionally returns the same pending shape (no enumeration),
      // so this is walked the same way either way.
      const sessionToken = envelope.meta?.session_token;
      if (sessionToken) {
        rememberHeadlessSession({ sessionToken, email: parsed.data.email });
      }
      router.push(`/${locale}/verify-email`);
    } catch (err: unknown) {
      if (isApiError(err)) {
        if (err.fieldErrors) setFieldErrors(err.fieldErrors);
        setError(err.message);
      } else {
        setError(t('signup_failed') || 'We could not create your account. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const signInHref = requestedRedirect
    ? `/${locale}/signin?redirect=${encodeURIComponent(redirectParam ?? '')}`
    : `/${locale}/signin`;

  return (
    <Card className="max-w-md mx-auto w-full">
      <div className="text-center mb-6">
        <h2 className="text-2xl font-serif font-semibold text-stone-900">
          {t('sign_up') || 'Create account'}
        </h2>
        <p className="text-sm text-stone-500 mt-1">
          {t('sign_up_subtitle') || 'Create an account to book your museum visit.'}
        </p>
      </div>

      {error && <ErrorBanner message={error} className="mb-4" />}

      <form onSubmit={handleSubmit} className="space-y-4">
        <TextField
          id="fullName"
          label={t('full_name_optional') || 'Full Name (Optional)'}
          type="text"
          placeholder="e.g., Hana"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          error={fieldErrors.full_name}
          required
          autoComplete="name"
        />

        <TextField
          id="email"
          label={t('email') || 'Email'}
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={fieldErrors.email}
          required
          autoComplete="email"
        />

        <PasswordField
          id="password"
          label={t('password') || 'Password'}
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={fieldErrors.password}
          required
          autoComplete="new-password"
        />

        <PasswordField
          id="confirmPassword"
          label={t('confirm_password') || 'Confirm Password'}
          placeholder="••••••••"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          error={fieldErrors.confirmPassword}
          required
          autoComplete="new-password"
        />

        <Button
          type="submit"
          size="lg"
          className="w-full bg-brand-primary hover:bg-primary-700"
          disabled={isLoading}
        >
          {isLoading ? t('loading') || 'Loading...' : t('sign_up') || 'Create account'}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-stone-500">
        {t('have_account') || 'Already have an account?'}{' '}
        <Link href={signInHref} className="font-semibold text-brand-primary hover:underline">
          {t('sign_in') || 'Sign In'}
        </Link>
      </p>
    </Card>
  );
}
