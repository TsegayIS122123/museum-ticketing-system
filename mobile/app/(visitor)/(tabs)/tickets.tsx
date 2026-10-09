import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Screen } from '@/components/ui/Screen';
import { colors, spacing, typography } from '@/theme';

export default function TicketsTab() {
  const { t } = useTranslation();
  return (
    <Screen>
      <View style={styles.center}>
        <Text style={styles.title}>{t('tabTickets', 'Tickets')}</Text>
        <Text style={styles.body}>
          {t('ticketsPlaceholder', 'Your digital tickets will appear here in Phase 5.')}
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: typography.sizes.xl, fontWeight: '700', color: colors.brandPrimary, marginBottom: spacing.sm },
  body: { fontSize: typography.sizes.sm, color: colors.textMuted, textAlign: 'center' },
});
