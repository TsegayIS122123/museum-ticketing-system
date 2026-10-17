import { useEffect, useState } from 'react';
import { View, StyleSheet, Image } from 'react-native';
import { AppText as Text } from '@/components/ui/AppText';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { Screen } from '@/components/ui/Screen';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { LanguageToggle } from '@/components/ui/LanguageToggle';
import { verifyEmail, resendVerificationEmail, useAuthActions } from '@/api/queries/auth';
import { isApiError } from '@/api/errors';
import { readHeadlessSession, clearHeadlessSession, HeadlessSessionState } from '@/auth/headlessSession';
import { homeForRole } from '@/auth/guards';
import { ASSETS } from '@/constants/assets';
import { colors, spacing } from '@/theme';

// FR-ACC-003 (revised): the verification email carries a 6-digit code (and a
// link that opens the web app). This screen redeems the typed code against the
// pending flow's session token (minted at signup). For the app client a
// successful verify returns the account plus the app's SimpleJWT in `meta`, so
// we can sign the user straight in -- matching the visitor flow's old OTP step
// but with email verification rather than phone OTP.
export default function VerifyEmailScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string }>();
  const { signIn } = useAuthActions();

  const emailParam = typeof params.email === 'string' ? params.email : '';

  const [session, setSession] = useState<HeadlessSessionState | null>(null);
  const [ready, setReady] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    readHeadlessSession()
      .then((s) => {
        if (cancelled) return;
        setSession(s);
        setReady(true);
      })
      .catch(() => {
        if (cancelled) return;
        setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const sessionToken = session?.sessionToken ?? null;
  const pendingEmail = session?.email ?? emailParam;

  const handleVerify = async () => {
    if (!sessionToken || code.length !== 6) return;
    setError('');
    setBusy(true);
    try {
      const envelope = await verifyEmail({ key: code, sessionToken });
      await clearHeadlessSession();
      const user = envelope.data?.user;
      const access = envelope.meta?.access_token;
      if (user && access) {
        await signIn({
          accessToken: access,
          refreshToken: envelope.meta?.refresh_token ?? '',
          user,
        });
        router.replace(homeForRole(user.role) as any);
      } else {
        // No tokens in the envelope (shouldn't happen for the app client) --
        // fall back to the sign-in screen rather than a dead end.
        router.replace('/(auth)/sign-in');
      }
    } catch (e) {
      setError(isApiError(e) ? e.message : t('verify_email_failed', 'This code is invalid or has expired.'));
    } finally {
      setBusy(false);
    }
  };

  const handleResend = async () => {
    if (!sessionToken) return;
    setError('');
    setNotice('');
    setBusy(true);
    try {
      await resendVerificationEmail(sessionToken);
      setNotice(t('verify_email_pending_resent', 'Verification email resent.'));
    } catch (e) {
      setError(isApiError(e) ? e.message : t('commonErrorGeneric', 'Unable to resend right now.'));
    } finally {
      setBusy(false);
    }
  };

  if (!ready) {
    return (
      <Screen>
        <View style={styles.header}>
          <Image
            source={ASSETS.brand.aauLogo}
            style={styles.logo}
            accessibilityLabel={t('aau_logo_alt', 'Addis Ababa University')}
          />
          <Text style={styles.title}>{t('museumName', 'ZNHM Ticketing')}</Text>
          <LanguageToggle />
        </View>
        <Card>
          <Text style={styles.cardTitle}>{t('verify_email_pending_title', 'Confirm your email')}</Text>
          <Text style={styles.hint}>{t('loading', 'Loading...')}</Text>
        </Card>
      </Screen>
    );
  }

  // No pending flow to resume (session token gone) -- point the user at a
  // path that will work rather than an unusable form.
  if (!sessionToken) {
    return (
      <Screen>
        <View style={styles.header}>
          <Image
            source={ASSETS.brand.aauLogo}
            style={styles.logo}
            accessibilityLabel={t('aau_logo_alt', 'Addis Ababa University')}
          />
          <Text style={styles.title}>{t('museumName', 'ZNHM Ticketing')}</Text>
          <LanguageToggle />
        </View>
        <Card>
          <Text style={styles.cardTitle}>{t('verify_email_pending_title', 'Confirm your email')}</Text>
          <Text style={styles.hint}>
            {t('verify_email_no_session', "We couldn't find a verification in progress.")}
          </Text>
          <Button
            label={t('sign_in', 'Sign In')}
            onPress={() => router.replace('/(auth)/sign-in')}
          />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.header}>
        <Image
          source={ASSETS.brand.aauLogo}
          style={styles.logo}
          accessibilityLabel={t('aau_logo_alt', 'Addis Ababa University')}
        />
        <Text style={styles.title}>{t('museumName', 'ZNHM Ticketing')}</Text>
        <LanguageToggle />
      </View>

      <Card>
        <Text style={styles.cardTitle}>{t('verify_email_pending_title', 'Confirm your email')}</Text>
        <Text style={styles.hint}>
          {t('verify_email_code_hint', 'Enter the 6-digit code from the email we sent')}
          {pendingEmail ? ` ${pendingEmail}` : ''}
        </Text>

        <TextField
          label={t('otpCode', 'One-Time Code')}
          value={code}
          onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
          keyboardType="number-pad"
          maxLength={6}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}
        {notice && !error ? <Text style={styles.notice}>{notice}</Text> : null}

        <Button
          label={busy ? t('loading', 'Loading…') : t('verify', 'Verify')}
          onPress={handleVerify}
          loading={busy}
          disabled={code.length !== 6}
        />
        <Button
          label={t('verify_email_pending_resend', 'Resend email')}
          variant="secondary"
          onPress={handleResend}
          disabled={busy}
        />
        <Button
          label={t('back', 'Back')}
          variant="secondary"
          onPress={() => router.replace('/(auth)/register')}
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
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.md,
  },
  hint: { color: colors.textMuted, marginBottom: spacing.md },
  error: { color: colors.danger, marginVertical: spacing.sm },
  notice: { color: colors.textMuted, marginVertical: spacing.sm },
});
