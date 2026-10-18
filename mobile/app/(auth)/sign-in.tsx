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
import { login, useAuthActions } from '@/api/queries/auth';
import { isApiError } from '@/api/errors';
import { homeForRole } from '@/auth/guards';
import { ASSETS } from '@/constants/assets';
import { colors, spacing } from '@/theme';

// The single front-door sign-in for every role (FR-ACC-002, FR-ACC-005):
// email + password only, and the server decides where you land via
// `user.role`. Replaces the old staff-only screen.
//
// Reached from the public visitor home ("Sign in" / "Book a visit"), which is
// why it keeps a way back there: without it, a guest who only wanted to look
// around would have no exit but the OS back gesture.
export default function SignInScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { signIn } = useAuthActions();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const handleLogin = async () => {
    setError('');
    setBusy(true);
    try {
      const res = await login({ email, password });
      await signIn({
        accessToken: res.access_token,
        refreshToken: res.refresh_token ?? '',
        user: res.user,
      });
      router.replace(homeForRole(res.user.role) as any);
    } catch (e) {
      setError(isApiError(e) ? e.message : t('commonErrorGeneric', 'Login failed'));
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
        <Text style={styles.title}>{t('sign_in', 'Sign In')}</Text>
        <LanguageToggle />
      </View>

      <Card>
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
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Button
          label={busy ? t('loading', 'Loading…') : t('sign_in', 'Sign In')}
          onPress={handleLogin}
          loading={busy}
        />
        <Text style={styles.footnote}>{t('no_account_yet', "Don't have an account?")}</Text>
        <Button
          label={t('sign_up', 'Create account')}
          variant="secondary"
          onPress={() => router.push('/(auth)/register')}
        />
        <Button
          label={t('back', 'Back')}
          variant="secondary"
          onPress={() => router.replace('/(visitor)' as any)}
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
  error: { color: colors.danger, marginVertical: spacing.sm },
  footnote: {
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
});
