import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Screen } from '@/components/ui/Screen';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/auth/useAuth';
import { colors, spacing } from '@/theme';

export default function VisitorHome() {
  const { t } = useTranslation();
  const { user, signOut } = useAuth();
  return (
    <Screen>
      <Text style={styles.title}>{t('roleVisitor', 'Visitor')}</Text>
      <Card>
        <Text style={styles.line}>
          {t('welcome', 'Welcome')}, {user?.full_name ?? user?.email}
        </Text>
        <Text style={styles.muted}>{t('mobilePhase2Body', 'Phase 3 will add browse & book.')}</Text>
        <Button label={t('signOut', 'Sign out')} variant="secondary" onPress={signOut} />
      </Card>
    </Screen>
  );
}
const styles = StyleSheet.create({
  title: { fontSize: 22, fontWeight: '700', color: colors.brandPrimary, marginBottom: spacing.lg },
  line: { fontSize: 16, color: colors.text, marginBottom: spacing.sm },
  muted: { fontSize: 14, color: colors.textMuted, marginBottom: spacing.md },
});
