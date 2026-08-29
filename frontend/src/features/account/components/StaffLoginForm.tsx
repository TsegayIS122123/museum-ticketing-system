'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { useAuth } from '@/lib/auth/auth-context';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { staffLogin } from '../api';
import { staffLoginSchema } from '../schemas';

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

    // Validate
    const result = staffLoginSchema.safeParse({ email, password });
    if (!result.success) {
      setError(result.error.errors[0].message);
      return;
    }

    setIsLoading(true);
    try {
      const response = await staffLogin({ email, password });
      
      login(
        { accessToken: response.accessToken, refreshToken: response.refreshToken },
        response.user
      );

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
      setError(err.message || t('login_failed') || 'Invalid email or password. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="max-w-md mx-auto">
      <div className="text-center mb-6">
        <div className="w-12 h-12 bg-amber-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
          <span className="text-white font-bold text-xl">SM</span>
        </div>
        <h2 className="text-2xl font-serif font-bold text-stone-900">
          {t('staff_login') || 'Staff Login'}
        </h2>
        <p className="text-sm text-stone-500 mt-1">
          {t('staff_login_description') || 'Sign in to access the staff dashboard'}
        </p>
      </div>

      {error && <ErrorBanner message={error} className="mb-4" />}

      <form onSubmit={handleSubmit} className="space-y-4">
        <TextField
          id="email"
          label={t('email')}
          type="email"
          placeholder="staff@museum.et"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
        />

        <TextField
          id="password"
          label={t('password') || 'Password'}
          type="password"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
        />

        <div className="flex justify-end">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-stone-500"
            onClick={() => router.push(`/${locale}/staff/forgot-password`)}
          >
            {t('forgot_password') || 'Forgot Password?'}
          </Button>
        </div>

        <Button
          type="submit"
          size="lg"
          className="w-full bg-amber-600 hover:bg-amber-700"
          disabled={isLoading}
        >
          {isLoading ? t('loading') : t('sign_in') || 'Sign In'}
        </Button>

        <div className="text-xs text-stone-400 text-center mt-2">
          {t('staff_login_note') || 'This page is for museum staff only. Visitors should use the verification flow.'}
        </div>
      </form>
    </Card>
  );
}
