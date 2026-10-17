import React from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { AppText as Text } from '@/components/ui/AppText';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/Card';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';
import { typography } from '@/theme/typography';
import { formatEtb } from '@/utils/money';
import { usePeriodComparison } from '@/api/queries/admin-reports';

export function ComparisonTab({ from, to }: { from?: string; to?: string }) {
  const { t } = useTranslation();
  const q = usePeriodComparison(from, to);

  if (q.isLoading) return <View style={styles.center}><ActivityIndicator color={colors.brandPrimary} /></View>;
  if (q.isError || !q.data) return <View style={styles.center}><Text style={styles.err}>{t('admin_reports_error', 'Could not load report')}</Text></View>;

  const { current, previous, deltas } = q.data;
  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <Card style={styles.card}>
        <Text style={styles.section}>{t('admin_reports_current', 'Current')}</Text>
        <Text style={styles.v}>{formatEtb(current.revenueEtb)} · {current.bookingCount} bookings · {current.attendedTotal} attended</Text>
        <Text style={styles.section}>{t('admin_reports_previous', 'Previous')}</Text>
        <Text style={styles.v}>{formatEtb(previous.revenueEtb)} · {previous.bookingCount} bookings · {previous.attendedTotal} attended</Text>
      </Card>
      <Card style={styles.card}>
        <Text style={styles.section}>{t('admin_reports_delta', 'Change')}</Text>
        <Text style={styles.v}>revenue {deltas.revenueEtbPct ?? '—'}%</Text>
        <Text style={styles.v}>bookings {deltas.bookingCountPct ?? '—'}%</Text>
        <Text style={styles.v}>attended {deltas.attendedTotalPct ?? '—'}%</Text>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: spacing.md, gap: spacing.md },
  card: { gap: spacing.xs },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  err: { color: colors.danger, fontFamily: typography.fontFamily.latin },
  section: { fontFamily: typography.fontFamily.latin, fontSize: typography.sizes.md, fontWeight: '700', color: colors.text, marginTop: spacing.sm },
  v: { fontFamily: typography.fontFamily.latin, fontSize: typography.sizes.sm, color: colors.text },
});
