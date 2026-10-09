import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { Screen } from '@/components/ui/Screen';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { colors, spacing, typography } from '@/theme';
import { useBalance } from '@/api/queries/settlement';
import { BalanceCard } from './BalanceCard';
import { ReconcileButton } from './ReconcileButton';

export function SettlementScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { data: balance, isLoading, isError, refetch } = useBalance();

  if (isLoading) {
    return (
      <Screen>
        <View style={styles.center}>
          <Text style={styles.muted}>{t('loading', 'Loading…')}</Text>
        </View>
      </Screen>
    );
  }

  if (isError || !balance) {
    return (
      <Screen>
        <View style={styles.center}>
          <Text style={styles.error}>{t('commonErrorGeneric', 'Something went wrong')}</Text>
          <Button label={t('retry', 'Retry')} onPress={() => refetch()} />
        </View>
      </Screen>
    );
  }

  const outstanding = parseFloat(balance.outstanding_etb);
  const canReconcile = outstanding > 0;

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <Text style={styles.title}>{t('settlementTitle', 'Settlement')}</Text>
          <Text style={styles.subtitle}>
            {t('settlementSubtitle', 'Transfer your outstanding balance to the Finance Office.')}
          </Text>
        </View>

        <BalanceCard balance={balance} />

        {canReconcile ? (
          <ReconcileButton
            onSuccess={() => {
              // Navigate to history immediately after a successful transfer
              router.push('/(cashier)/settlement/history' as any);
            }}
          />
        ) : (
          <Card style={styles.okCard}>
            <Text style={styles.okText}>
              {t('nothingToSettle', 'Nothing to settle — your balance is zero.')}
            </Text>
          </Card>
        )}

        <Button
          label={t('viewHistory', 'View settlement history')}
          variant="secondary"
          onPress={() => router.push('/(cashier)/settlement/history' as any)}
        />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: spacing.lg, gap: spacing.md },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.md },
  header: { marginBottom: spacing.md },
  title: { fontSize: typography.sizes.xl, fontWeight: '700', color: colors.text },
  subtitle: { fontSize: typography.sizes.sm, color: colors.textMuted, marginTop: spacing.xs },
  muted: { color: colors.textMuted },
  error: { color: colors.danger },
  okCard: { backgroundColor: '#D1FAE5' },
  okText: { color: '#065F46', fontWeight: '600', textAlign: 'center' },
});
