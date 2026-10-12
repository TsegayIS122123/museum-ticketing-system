import React from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/Card';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';
import { typography } from '@/theme/typography';
import { formatEtb } from '@/utils/money';
import { useCashierBalances } from '@/api/queries/admin-reports';

export function CashierBalancesTab() {
  const { t } = useTranslation();
  const q = useCashierBalances();

  if (q.isLoading) return <View style={styles.center}><ActivityIndicator color={colors.brandPrimary} /></View>;
  if (q.isError || !q.data) return <View style={styles.center}><Text style={styles.err}>{t('admin_reports_error', 'Could not load report')}</Text></View>;

  const d = q.data;
  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <Card style={styles.card}>
        <Text style={styles.k}>{t('admin_reports_outstanding', 'Outstanding')}</Text>
        <Text style={styles.v}>{formatEtb(d.totalOutstandingEtb)}</Text>
        <Text style={styles.k}>Reconciled</Text>
        <Text style={styles.v}>{formatEtb(d.totalReconciledEtb)}</Text>
        <Text style={styles.k}>Revenue</Text>
        <Text style={styles.v}>{formatEtb(d.totalRevenueEtb)}</Text>
      </Card>

      <Card style={styles.card}>
        <Text style={styles.section}>{t('admin_reports_cashier', 'Cashier')}</Text>
        {d.cashiers.map((c) => (
          <View key={c.cashierId} style={styles.row}>
            <Text style={styles.rowLabel}>{c.cashierName}</Text>
            <Text style={styles.rowValue}>
              {formatEtb(c.outstandingBalanceEtb)} · {c.unreconciledBookingCount}
            </Text>
          </View>
        ))}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: spacing.md, gap: spacing.md },
  card: { gap: spacing.xs },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  err: { color: colors.danger, fontFamily: typography.fontFamily.latin },
  k: { fontFamily: typography.fontFamily.latin, fontSize: typography.sizes.sm, color: colors.textMuted },
  v: { fontFamily: typography.fontFamily.latin, fontSize: typography.sizes.lg, fontWeight: '600', color: colors.text, marginBottom: spacing.sm },
  section: { fontFamily: typography.fontFamily.latin, fontSize: typography.sizes.md, fontWeight: '700', color: colors.text, marginBottom: spacing.sm },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.xs },
  rowLabel: { fontFamily: typography.fontFamily.latin, fontSize: typography.sizes.sm, color: colors.text },
  rowValue: { fontFamily: typography.fontFamily.latin, fontSize: typography.sizes.sm, color: colors.textMuted },
});
