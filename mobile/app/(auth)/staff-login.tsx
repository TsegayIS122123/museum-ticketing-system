import { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { Screen } from '@/components/ui/Screen';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { LanguageToggle } from '@/components/ui/LanguageToggle';
import { staffLogin, useAuthActions } from '@/api/queries/auth';
import { isApiError } from '@/api/errors';
import { homeForRole } from '@/auth/guards';
import { colors, spacing } from '@/theme';

export default function StaffLoginScreen() {
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
      const res = await staffLogin({ email, password });
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
        <Text style={styles.title}>{t('staffLogin', 'Staff login')}</Text>
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
          label={busy ? t('loading', 'Loading…') : t('signIn', 'Sign in')}
          onPress={handleLogin}
          loading={busy}
        />
        <Button
          label={t('back', 'Back')}
          variant="secondary"
          onPress={() => router.push('/(auth)/visitor-verify')}
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
  error: { color: colors.danger, marginVertical: spacing.sm },
});
