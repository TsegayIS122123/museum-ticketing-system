'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Mail, RefreshCw } from 'lucide-react';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { useAuth } from '@/lib/auth/auth-context';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { Card } from '@/components/ui/Card';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import {
  startVisitorVerification,
  confirmVisitorVerification,
  getCurrentUser,
} from '../api';

type Step = 'email-phone' | 'otp' | 'email-pending';

// FR-ACC-003: a Visitor isn't fully verified on OTP alone -- email must be
// confirmed too (via the magic link `start_visitor_verification` already
// emails out alongside the OTP). Previously that only got enforced later,
// inside create_booking, so a visitor could complete this form, get a
// session, and only find out her email was still unverified when the
// backend rejected her booking at the payment step. This component now
// enforces it right here, right after OTP confirmation, so it's a single
// linear signup flow instead of a surprise blocker three steps later.
function isFullyVerified(user: { email_verified_at: string | null } | null): boolean {
  return !!user?.email_verified_at;
}

export function VisitorVerifyForm() {
  const { t, locale } = useTranslation();
  const router = useRouter();
  const { user, isAuthenticated, login, setUser } = useAuth();

  // A visitor who already has a session (fresh from the OTP step below,
  // or returning later e.g. via a bookmarked /verify link) but never
  // finished the email side of verification lands straight on the
  // "check your email" panel -- no reason to make her redo email/phone/
  // OTP she's already completed just to get back here.
  const startOnEmailPending = isAuthenticated && !!user && !isFullyVerified(user);

  const [step, setStep] = useState<Step>(startOnEmailPending ? 'email-pending' : 'email-phone');
  const [verificationId, setVerificationId] = useState<string>('');
  const [email, setEmail] = useState(user?.email ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [fullName, setFullName] = useState(user?.full_name ?? '');
  const [otpCode, setOtpCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Covers `user` becoming known only after this component's first
  // render (auth bootstrap hadn't resolved yet -- see AuthProvider) by
  // jumping to the email-pending panel once it does. Adjusted during
  // render rather than in an effect, same pattern as ProfilePage.tsx's
  // `prevUser`: a plain `useEffect([user])` calling setState here would
  // itself trigger an extra render for no benefit, since this only ever
  // needs to run once per `user` identity change anyway.
  const [seenUser, setSeenUser] = useState(user);
  if (user !== seenUser) {
    setSeenUser(user);
    if (isAuthenticated && user && !isFullyVerified(user) && step === 'email-phone') {
      setEmail(user.email);
      setPhone(user.phone ?? '');
      setFullName(user.full_name ?? '');
      setStep('email-pending');
    }
  }

  // Genuinely a side effect (leaving the page), so this one does belong
  // in an effect: a fully-verified visitor who navigates to /verify
  // directly has nothing left to do here -- back to her bookings
  // instead of re-showing a login form she doesn't need.
  useEffect(() => {
    if (isAuthenticated && user && isFullyVerified(user)) {
      router.replace(`/${locale}/bookings`);
    }
  }, [isAuthenticated, user, locale, router]);

  const handleStartVerification = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email || !phone) {
      setError(t('email_phone_required') || 'Please enter both email and phone number.');
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
      setError(err.message || t('otp_send_failed') || 'Failed to send verification code. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmVerification = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!otpCode || otpCode.length !== 6) {
      setError(t('otp_invalid_length') || 'Please enter a valid 6-digit verification code.');
      return;
    }

    setIsLoading(true);
    try {
      const response = await confirmVisitorVerification({ verification_id: verificationId, otp_code: otpCode });
      login({ access_token: response.access_token }, response.user);

      if (isFullyVerified(response.user)) {
        router.push(`/${locale}/bookings`);
      } else {
        // Phone's proven, email isn't yet -- stop here instead of
        // dropping her into /bookings and letting a later booking
        // attempt be the first place she learns email is still required.
        setStep('email-pending');
      }
    } catch (err: any) {
      setError(err.message || t('otp_invalid_code') || 'Invalid verification code. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendEmail = async () => {
    setError(null);
    setNotice(null);
    setIsLoading(true);
    try {
      // No separate "resend just the email link" endpoint exists --
      // start_visitor_verification is the one place that mails the
      // magic link out, so it's reused here. It also reissues a phone
      // OTP as a side effect, but that's harmless: this account's phone
      // is already verified and nothing on this screen consumes it.
      await startVisitorVerification({
        email,
        phone,
        full_name: fullName || undefined,
        language_preference: locale as 'en' | 'am',
      });
      setNotice(t('verify_email_pending_resent') || 'Verification email resent.');
    } catch (err: any) {
      setError(err.message || t('otp_send_failed') || 'Failed to send verification code. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCheckVerified = async () => {
    setError(null);
    setNotice(null);
    setIsLoading(true);
    try {
      const updated = await getCurrentUser();
      setUser(updated);
      if (isFullyVerified(updated)) {
        router.push(`/${locale}/bookings`);
      } else {
        setError(
          t('verify_email_pending_still_unverified') ||
            "We still don't see that email confirmed. Check your inbox (and spam folder), then try again."
        );
      }
    } catch (err: any) {
      setError(err.message || t('verify_email_pending_still_unverified') || 'Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  if (step === 'email-pending') {
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
            {t('verify_email_pending_subtitle') ||
              "You're signed in, but you still need to confirm your email before you can book. We sent a confirmation link to"}{' '}
            <span className="font-semibold text-stone-700">{email}</span>
          </p>
        </div>

        {error && <ErrorBanner message={error} className="mb-4" />}
        {notice && !error && (
          <div className="mb-4 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{notice}</div>
        )}

        <div className="space-y-3">
          <Button
            type="button"
            size="lg"
            className="w-full bg-brand-primary hover:bg-primary-700"
            disabled={isLoading}
            onClick={handleCheckVerified}
          >
            {isLoading ? t('loading') : t('verify_email_pending_continue') || "I've verified, continue"}
          </Button>

          <Button
            type="button"
            variant="secondary"
            size="lg"
            className="w-full"
            disabled={isLoading}
            onClick={handleResendEmail}
          >
            <RefreshCw className="w-4 h-4" /> {t('verify_email_pending_resend') || 'Resend email'}
          </Button>
        </div>
      </Card>
    );
  }

  if (step === 'otp') {
    return (
      <Card className="max-w-md mx-auto">
        <div className="text-center mb-6">
          <h2 className="text-2xl font-serif font-semibold text-stone-900">
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
            className="w-full bg-brand-primary hover:bg-primary-700"
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
            <ArrowLeft className="w-4 h-4" /> {t('back') || 'Back'}
          </Button>
        </form>
      </Card>
    );
  }

  return (
    <Card className="max-w-md mx-auto">
      <div className="text-center mb-6">
        <h2 className="text-2xl font-serif font-semibold text-stone-900">
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
          label={t('full_name_optional') || 'Full Name (Optional)'}
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
          className="w-full bg-brand-primary hover:bg-primary-700"
          disabled={isLoading}
        >
          {isLoading ? t('loading') : t('continue')}
        </Button>

        <div className="text-xs text-stone-500 text-center mt-2">
          {t('no_password_required') || 'No password needed. A one-time code will be sent to your phone.'}
        </div>
      </form>
    </Card>
  );
}
