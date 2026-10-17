import { useState } from 'react';
import { View, StyleSheet, Image } from 'react-native';
import { AppText as Text } from '@/components/ui/AppText';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { Screen } from '@/components/ui/Screen';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { LanguageToggle } from '@/components/ui/LanguageToggle';
import { signUp } from '@/api/queries/auth';
import { isApiError } from '@/api/errors';
import { rememberHeadlessSession } from '@/auth/headlessSession';
import { ASSETS } from '@/constants/assets';
import { colors, spacing } from '@/theme';

// Self-registration always produces a Visitor account; the verification email
// (6-digit code + link) is sent immediately. We stash the flow's session token
// (from the signup envelope `meta`) so the verify-email screen can redeem it.
export default function RegisterScreen() {
  const { t } = useTranslation();
  const router = useRouter();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const handleRegister = async () => {
    setError('');
    if (!fullName.trim()) {
      setError(t('fullNameRequired', 'Full name is required'));
      return;
    }
    if (password !== confirmPassword) {
      setError(t('passwordMismatch', 'Passwords do not match'));
      return;
    }
    setBusy(true);
    try {
      const envelope = await signUp({ email, full_name: fullName, password });
      const sessionToken = envelope.meta?.session_token;
      if (sessionToken) {
        await rememberHeadlessSession({ sessionToken, email });
      }
      router.replace({
        pathname: '/(auth)/verify-email',
        params: { email },
      });
    } catch (e) {
      setError(isApiError(e) ? e.message : t('commonErrorGeneric', 'Something went wrong'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <View style={styles.header}>
        <Image
          source={ASSETS.brand.aauLogo}
          style={styles.logo}
          accessibilityLabel={t('aau_logo_alt', 'Addis Ababa University')}
        />
        <Text style={styles.title}>{t('sign_up', 'Create account')}</Text>
        <LanguageToggle />
      </View>

      <Card>
        <Text style={styles.subtitle}>
          {t('sign_up_subtitle', 'Create an account to book your museum visit.')}
        </Text>
        <TextField
          label={t('fullName', 'Full name')}
          value={fullName}
          onChangeText={setFullName}
        />
        <TextField
          label={t('email', 'Email')}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <TextField
          label={t('password', 'Password')}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />
        <TextField
          label={t('confirmPassword', 'Confirm password')}
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          secureTextEntry
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Button
          label={busy ? t('loading', 'Loading…') : t('sign_up', 'Create account')}
          onPress={handleRegister}
          loading={busy}
        />
        <Text style={styles.footnote}>
          {t('have_account', 'Already have an account?')}
        </Text>
        <Button
          label={t('sign_in', 'Sign In')}
          variant="secondary"
          onPress={() => router.replace('/(auth)/sign-in')}
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
  logo: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surface },
  subtitle: { color: colors.textMuted, marginBottom: spacing.md },
  error: { color: colors.danger, marginVertical: spacing.sm },
  footnote: {
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
});
