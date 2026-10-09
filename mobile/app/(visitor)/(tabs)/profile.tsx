import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Screen } from '@/components/ui/Screen';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { LanguageToggle } from '@/components/ui/LanguageToggle';
import { useAuth } from '@/auth/useAuth';
import { colors, spacing, typography } from '@/theme';

export default function ProfileTab() {
  const { t } = useTranslation();
  const { user, signOut } = useAuth();
  return (
    <Screen>
      <Card>
        <Text style={styles.name}>{user?.full_name ?? user?.email}</Text>
        <Text style={styles.email}>{user?.email}</Text>

        <View style={styles.langRow}>
          <Text style={styles.langLabel}>{t('language', 'Language')}</Text>
          <LanguageToggle />
        </View>

        <Button label={t('signOut', 'Sign out')} variant="secondary" onPress={signOut} />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  name: { fontSize: typography.sizes.lg, fontWeight: '700', color: colors.text },
  email: { fontSize: typography.sizes.sm, color: colors.textMuted, marginBottom: spacing.lg },
  langRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg },
  langLabel: { fontSize: typography.sizes.sm, color: colors.text },
});
