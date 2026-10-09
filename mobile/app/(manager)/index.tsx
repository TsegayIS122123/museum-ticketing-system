import { Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Screen } from '@/components/ui/Screen';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/auth/useAuth';
import { colors, spacing } from '@/theme';

export default function ManagerHome() {
  const { t } = useTranslation();
  const { signOut } = useAuth();
  return (
    <Screen>
      <Text style={styles.title}>{t('roleMuseumManager', 'Museum Manager')}</Text>
      <Card>
        <Text style={styles.muted}>{t('mobilePhase11Body', 'Phase 11 will add the manager console.')}</Text>
        <Button label={t('signOut', 'Sign out')} variant="secondary" onPress={signOut} />
      </Card>
    </Screen>
  );
}
const styles = StyleSheet.create({
  title: { fontSize: 22, fontWeight: '700', color: colors.brandPrimary, marginBottom: spacing.lg },
  muted: { fontSize: 14, color: colors.textMuted, marginBottom: spacing.md },
});
