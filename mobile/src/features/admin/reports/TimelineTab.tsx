import React from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/Card';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';
import { typography } from '@/theme/typography';
import { useBookingTimeline } from '@/api/queries/admin-reports';

export function TimelineTab() {
  const { t } = useTranslation();
  const q = useBookingTimeline();

  if (q.isLoading) return <View style={styles.center}><ActivityIndicator color={colors.brandPrimary} /></View>;
  if (q.isError || !q.data) return <View style={styles.center}><Text style={styles.err}>{t('admin_reports_error', 'Could not load report')}</Text></View>;

  return (
    <FlatList
      data={q.data.days}
      keyExtractor={(d) => d.date}
      contentContainerStyle={styles.list}
      renderItem={({ item }) => (
        <Card style={styles.card}>
          <Text style={styles.date}>{item.date} {item.isOpenForBooking ? '' : '· closed'}</Text>
          <Text style={styles.row}>
            awaiting {item.awaitingPaymentCount} · pending {item.pendingCount} · visited {item.visitedCount} · cancelled {item.cancelledCount} · refunded {item.refundedCount}
          </Text>
          <Text style={styles.head}>
            expected headcount {item.expectedHeadcount}
          </Text>
        </Card>
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing.md, gap: spacing.sm },
  card: { gap: spacing.xs },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  err: { color: colors.danger, fontFamily: typography.fontFamily.latin },
  date: { fontFamily: typography.fontFamily.latin, fontSize: typography.sizes.md, fontWeight: '600', color: colors.text },
  row: { fontFamily: typography.fontFamily.latin, fontSize: typography.sizes.sm, color: colors.textMuted },
  head: { fontFamily: typography.fontFamily.latin, fontSize: typography.sizes.sm, color: colors.text },
});
