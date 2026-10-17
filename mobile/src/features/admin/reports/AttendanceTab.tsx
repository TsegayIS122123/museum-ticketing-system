import React from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { AppText as Text } from '@/components/ui/AppText';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/Card';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';
import { typography } from '@/theme/typography';
import { useAttendanceReport } from '@/api/queries/admin-reports';

export function AttendanceTab({ from, to }: { from?: string; to?: string }) {
  const { t } = useTranslation();
  const q = useAttendanceReport(from, to);

  if (q.isLoading) return <View style={styles.center}><ActivityIndicator color={colors.brandPrimary} /></View>;
  if (q.isError || !q.data) return <View style={styles.center}><Text style={styles.err}>{t('admin_reports_error', 'Could not load report')}</Text></View>;

  const d = q.data;
  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <Card style={styles.card}>
        <Text style={styles.k}>{t('admin_reports_booked', 'Booked')}</Text>
        <Text style={styles.v}>{d.bookedTotal}</Text>
        <Text style={styles.k}>{t('admin_reports_attended', 'Attended')}</Text>
        <Text style={styles.v}>{d.attendedTotal}</Text>
        <Text style={styles.k}>{t('admin_reports_shortfall', 'Shortfall')}</Text>
        <Text style={styles.v}>{d.shortfallTotal}</Text>
        <Text style={styles.k}>{t('admin_reports_no_show', 'No-shows')}</Text>
        <Text style={styles.v}>{d.noShowHeadcount} ({d.noShowRatePct ?? '—'}%)</Text>
        <Text style={styles.k}>{t('admin_reports_corrected', 'Corrected')}</Text>
        <Text style={styles.v}>{d.correctedBookingCount}</Text>
        <Text style={styles.k}>{t('admin_reports_currently_flagged', 'Currently flagged')}</Text>
        <Text style={styles.v}>{d.currentlyFlaggedCount}</Text>
      </Card>

      <Card style={styles.card}>
        <Text style={styles.section}>{t('admin_reports_category', 'Category')}</Text>
        {d.byCategory.map((row) => (
          <View key={row.category} style={styles.row}>
            <Text style={styles.rowLabel}>{row.category}</Text>
            <Text style={styles.rowValue}>
              {row.attendedTotal} / {row.bookedTotal}
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
