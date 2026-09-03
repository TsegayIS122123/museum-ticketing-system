'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { Toast } from '@/components/ui/Toast';
import { staffForgotPassword } from '@/features/account/api';

export default function ForgotPasswordPage() {
  const { t, locale } = useTranslation();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setToast(null);

    try {
      await staffForgotPassword({ email });
      setIsSubmitted(true);
      setToast({
        message: t('password_reset_sent') || 'Password reset link has been sent to your email.',
        type: 'success',
      });
    } catch {
      setToast({
        message: t('password_reset_failed') || 'Unable to send the request. Please try again.',
        type: 'error',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4" data-surface="visitor">
      <Card className="max-w-md w-full">
        <div className="text-center mb-6">
          <h2 className="text-2xl font-serif font-bold text-stone-900">
            {t('reset_password') || 'Reset Password'}
          </h2>
          <p className="text-sm text-stone-500 mt-1">
            {t('reset_password_description') || 'Enter your email address and we\'ll send you a link to reset your password.'}
          </p>
        </div>

        {toast && (
          <Toast
            message={toast.message}
            type={toast.type}
            onClose={() => setToast(null)}
          />
        )}

        {isSubmitted ? (
          <div className="text-center py-4">
            <div className="text-4xl mb-4">📧</div>
            <p className="text-stone-700">
              {t('check_email') || 'Check your email for the reset link.'}
            </p>
            <Button
              variant="secondary"
              className="mt-4"
              onClick={() => router.push(`/${locale}/staff/login`)}
            >
              {t('back_to_login') || 'Back to Login'}
            </Button>
          </div>
        ) : (
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

            <Button
              type="submit"
              size="lg"
              className="w-full bg-primary-600 hover:bg-primary-700"
              disabled={isLoading}
            >
              {isLoading ? t('loading') : t('send_reset_link') || 'Send Reset Link'}
            </Button>

            <p className="text-center text-sm text-stone-500">
              {t('reset_link_help') || 'If the address is registered, you will receive reset instructions.'}
            </p>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full text-stone-500"
              onClick={() => router.push(`/${locale}/staff/login`)}
            >
              ← {t('back_to_login') || 'Back to Login'}
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
}
