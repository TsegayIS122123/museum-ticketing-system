'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { useAuth } from '@/lib/auth/auth-context';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { Card } from '@/components/ui/Card';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import {
  startVisitorVerification,
  confirmVisitorVerification,
} from '../api';

type Step = 'email-phone' | 'otp';

export function VisitorVerifyForm() {
  const { t, locale } = useTranslation();
  const router = useRouter();
  const { login } = useAuth();
  
  const [step, setStep] = useState<Step>('email-phone');
  const [verificationId, setVerificationId] = useState<string>('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [fullName, setFullName] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleStartVerification = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email || !phone) {
      setError('Please enter both email and phone number.');
      return;
    }

    setIsLoading(true);
    try {
      const response = await startVisitorVerification({
        email,
        phone,
        full_name: fullName || undefined,
        language_preference: locale as 'en' | 'am',
      });
      setVerificationId(response.verification_id);
      setStep('otp');
    } catch (err: any) {
      setError(err.message || 'Failed to send verification code. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmVerification = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!otpCode || otpCode.length !== 6) {
      setError('Please enter a valid 6-digit verification code.');
      return;
    }

    setIsLoading(true);
    try {
      const response = await confirmVisitorVerification({ verification_id: verificationId, otp_code: otpCode });
      login(
        { access_token: response.access_token, refresh_token: response.refresh_token },
        response.user
      );
      router.push(`/${locale}/bookings`);
    } catch (err: any) {
      setError(err.message || 'Invalid verification code. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  if (step === 'otp') {
    return (
      <Card className="max-w-md mx-auto">
        <div className="text-center mb-6">
          <h2 className="text-2xl font-serif font-bold text-stone-900">
            {t('verify')}
          </h2>
          <p className="text-sm text-stone-500 mt-1">
            {t('otp_code')}
          </p>
        </div>

        {error && <ErrorBanner message={error} className="mb-4" />}

        <form onSubmit={handleConfirmVerification} className="space-y-4">
          <TextField
            id="otp"
            label={t('otp_code')}
            type="text"
            inputMode="numeric"
            placeholder="123456"
            value={otpCode}
            onChange={(e) => setOtpCode(e.target.value)}
            maxLength={6}
            required
            className="text-center text-2xl tracking-widest"
          />

          <div className="text-xs text-stone-500 text-center">
            {t('otp_sent_to') || 'Code sent to'} {phone}
          </div>

          <Button
            type="submit"
            size="lg"
            className="w-full bg-primary-600 hover:bg-primary-700"
            disabled={isLoading}
          >
            {isLoading ? t('loading') : t('verify')}
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full text-stone-500"
            onClick={() => {
              setStep('email-phone');
              setError(null);
            }}
          >
            ← {t('continue') || 'Back'}
          </Button>
        </form>
      </Card>
    );
  }

  return (
    <Card className="max-w-md mx-auto">
      <div className="text-center mb-6">
        <div className="w-12 h-12 bg-primary-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
          <span className="text-white font-bold text-xl">SM</span>
        </div>
        <h2 className="text-2xl font-serif font-bold text-stone-900">
          {t('verify_visitor')}
        </h2>
        <p className="text-sm text-stone-500 mt-1">
          {t('verify_subtitle') || 'Enter your email and phone number to receive a one-time code.'}
        </p>
      </div>

      {error && <ErrorBanner message={error} className="mb-4" />}

      <form onSubmit={handleStartVerification} className="space-y-4">
        <TextField
          id="fullName"
          label="Full Name (Optional)"
          type="text"
          placeholder="e.g., Hana"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
        />

        <TextField
          id="email"
          label={t('email')}
          type="email"
          placeholder="hana@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />

        <TextField
          id="phone"
          label={t('phone')}
          type="tel"
          placeholder="+251 912 345 678"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          required
        />

        <Button
          type="submit"
          size="lg"
          className="w-full bg-primary-600 hover:bg-primary-700"
          disabled={isLoading}
        >
          {isLoading ? t('loading') : t('continue')}
        </Button>

        <div className="text-xs text-stone-400 text-center mt-2">
          {t('no_password_required') || 'No password needed. A one-time code will be sent to your phone.'}
        </div>
      </form>
    </Card>
  );
}
