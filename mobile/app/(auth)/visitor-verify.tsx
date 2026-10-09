import { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { Screen } from '@/components/ui/Screen';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { LanguageToggle } from '@/components/ui/LanguageToggle';
import { useAuth } from '@/auth/useAuth';
import { useAuthActions } from '@/api/queries/auth';
import { startVisitorVerification, confirmVisitorVerification } from '@/api/queries/auth';
import { isApiError } from '@/api/errors';
import { colors, spacing } from '@/theme';

export default function VisitorVerifyScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { signIn } = useAuthActions();

  const [step, setStep] = useState<'start' | 'otp'>('start');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [verificationId, setVerificationId] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const handleStart = async () => {
    setError('');
    setBusy(true);
    try {
      const res = await startVisitorVerification({ email, phone });
      setVerificationId(res.verification_id);
      setStep('otp');
    } catch (e) {
      setError(isApiError(e) ? e.message : t('commonErrorGeneric', 'Something went wrong'));
    } finally {
      setBusy(false);
    }
  };

  const handleConfirm = async () => {
    setError('');
    setBusy(true);
    try {
      const res = await confirmVisitorVerification({
        verification_id: verificationId,
        otp_code: otp,
      });
      await signIn({
        accessToken: res.access_token,
        refreshToken: res.refresh_token ?? '',
        user: res.user,
      });
      router.replace('/(visitor)');
    } catch (e) {
      setError(isApiError(e) ? e.message : t('commonErrorGeneric', 'Invalid code'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.title}>{t('museumName', 'ZNHM Ticketing')}</Text>
        <LanguageToggle />
      </View>

      <Card>
        <Text style={styles.cardTitle}>
          {step === 'start'
            ? t('visitorVerifyTitle', 'Verify to continue')
            : t('otpTitle', 'Enter the 6-digit code')}
        </Text>

        {step === 'start' ? (
          <>
            <TextField
              label={t('email', 'Email')}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
            />
            <TextField
              label={t('phone', 'Phone')}
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Button
              label={busy ? t('loading', 'Loading…') : t('continue', 'Continue')}
              onPress={handleStart}
              loading={busy}
            />
          </>
        ) : (
          <>
            <TextField
              label={t('otpCode', 'One-Time Code')}
              value={otp}
              onChangeText={setOtp}
              keyboardType="number-pad"
              maxLength={6}
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Button
              label={busy ? t('loading', 'Loading…') : t('verify', 'Verify')}
              onPress={handleConfirm}
              loading={busy}
            />
            <Button
              label={t('back', 'Back')}
              variant="secondary"
              onPress={() => setStep('start')}
            />
          </>
        )}

        <Button
          label={t('staffLogin', 'Staff login')}
          variant="secondary"
          onPress={() => router.push('/(auth)/staff-login')}
        />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  title: { fontSize: 22, fontWeight: '700', color: colors.brandPrimary },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.md,
  },
  error: { color: colors.danger, marginVertical: spacing.sm },
});
