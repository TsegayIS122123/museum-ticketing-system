'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { useAuth } from '@/lib/auth/auth-context';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { PasswordField } from '@/components/ui/PasswordField';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { staffLogin } from '../api';

export function StaffLoginForm() {
  const { t, locale } = useTranslation();
  const router = useRouter();
  const { login } = useAuth();

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
      const response = await staffLogin({ email, password });
      
      login({ access_token: response.access_token }, response.user);

      // Redirect based on role
      const role = response.user.role;
      if (role === 'cashier') {
        router.push(`/${locale}/staff/gate`);
      } else if (role === 'museum_manager') {
        router.push(`/${locale}/staff/dashboard`);
      } else if (role === 'platform_admin') {
        router.push(`/${locale}/staff/admin/staff`);
      } else {
        router.push(`/${locale}/`);
      }
    } catch (err: any) {
      setError(t('invalid_credentials') || 'Invalid email or password.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="max-w-md mx-auto w-full">
      <div className="text-center mb-6">
        <div className="w-12 h-12 bg-primary-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
          <span className="text-white font-bold text-xl">SM</span>
        </div>
        <h2 className="text-2xl font-serif font-semibold text-stone-900">
          {t('staff_login') || 'Staff Login'}
        </h2>
        <p className="text-sm text-stone-500 mt-1">
          {t('staff_login_subtitle') || 'Sign in to access the staff dashboard'}
        </p>
      </div>

      {error && <ErrorBanner message={error} className="mb-4" />}

      <form onSubmit={handleSubmit} className="space-y-4">
        <TextField
          id="email"
          label={t('email') || 'Email'}
          type="email"
          placeholder="staff@museum.et"
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
          <Link href={`/${locale}/staff/forgot-password`} className="text-sm text-brand-primary hover:underline">
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

        <div className="text-xs text-stone-400 text-center mt-2">
          {t('staff_only_notice') || 'This page is for museum staff only. Visitors should use the verification flow.'}
        </div>
      </form>
    </Card>
  );
}
