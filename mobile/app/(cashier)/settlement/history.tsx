import { View, StyleSheet } from 'react-native';
import { AppText as Text } from '@/components/ui/AppText';
import { useTranslation } from 'react-i18next';
import { Screen } from '@/components/ui/Screen';
import { HistoryList } from '@/features/cashier/settlement/HistoryList';
import { colors, spacing, typography } from '@/theme';

export default function SettlementHistoryRoute() {
  const { t } = useTranslation();
  return (
    <Screen padded={false}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('settlementHistory', 'Settlement history')}</Text>
      </View>
      <HistoryList />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { padding: spacing.lg },
  title: { fontSize: typography.sizes.xl, fontWeight: '700', color: colors.text },
});
