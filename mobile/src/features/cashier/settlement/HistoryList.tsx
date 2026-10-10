import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';

import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { colors, radius, spacing, typography } from '@/theme';
import { formatEtb } from '@/utils/money';
import { formatDateTime } from '@/utils/dates';
import { useSettlementHistory, type Reconciliation } from '@/api/queries/settlement';

export function HistoryList() {
  const { t } = useTranslation();
  const { data, isLoading, isError, refetch, isRefetching } = useSettlementHistory();

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.brandPrimary} size="large" />
      </View>
    );
  }

  if (isError || !data) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{t('commonErrorGeneric', 'Something went wrong')}</Text>
        <Button label={t('retry', 'Retry')} onPress={() => refetch()} />
      </View>
    );
  }

  if (data.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyTitle}>{t('noSettlements', 'No settlements yet')}</Text>
        <Text style={styles.emptyBody}>
          {t('noSettlementsBody', 'Settlement transfers will appear here.')}
        </Text>
      </View>
    );
  }

  return (
    <FlatList
      data={data}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.list}
      refreshControl={
        <RefreshControl
          refreshing={isRefetching}
          onRefresh={refetch}
          colors={[colors.brandPrimary]}
          tintColor={colors.brandPrimary}
        />
      }
      renderItem={({ item }) => <HistoryRow r={item} />}
    />
  );
}

function HistoryRow({ r }: { r: Reconciliation }) {
  const { t } = useTranslation();
  const badge = statusStyle(r.status, t);

  return (
    <Card style={styles.card}>
      <View style={styles.row}>
        <Text style={styles.amount}>{formatEtb(r.amountEtb)}</Text>
        <View style={[styles.badge, badge.bg]}>
          <Text style={[styles.badgeText, badge.fg]}>{badge.label}</Text>
        </View>
      </View>
      <Text style={styles.date}>{formatDateTime(r.createdAt ?? r.initiatedAt ?? '')}</Text>
      {r.chapaTransferReference ? (
        <Text style={styles.ref}>
          {t('transferRef', 'Ref')}: {r.chapaTransferReference}
        </Text>
      ) : null}
      {r.failureReason ? (
        <Text style={styles.failure}>{r.failureReason}</Text>
      ) : null}
    </Card>
  );
}

function statusStyle(status: Reconciliation['status'], t: any) {
  switch (status) {
    case 'completed':
      return {
        label: t('statusCompleted', 'Completed'),
        bg: { backgroundColor: '#D1FAE5' },
        fg: { color: '#065F46' },
      };
    case 'failed':
      return {
        label: t('statusFailed', 'Failed'),
        bg: { backgroundColor: '#FEE2E2' },
        fg: { color: '#991B1B' },
      };
    default:
      return {
        label: t('statusPending', 'Pending'),
        bg: { backgroundColor: '#DBEAFE' },
        fg: { color: '#1E40AF' },
      };
  }
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.md },
  list: { padding: spacing.lg },
  card: { marginBottom: spacing.md, gap: spacing.xs },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  amount: { fontSize: typography.sizes.lg, fontWeight: '700', color: colors.brandPrimary, fontFamily: typography.fontFamily.latin },
  badge: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.pill },
  badgeText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  date: { fontSize: typography.sizes.xs, color: colors.textMuted },
  ref: { fontSize: typography.sizes.xs, color: colors.textMuted, fontFamily: typography.fontFamily.latin },
  failure: { fontSize: typography.sizes.xs, color: colors.danger, marginTop: spacing.xs },
  error: { color: colors.danger },
  emptyTitle: { fontSize: typography.sizes.md, fontWeight: '700', color: colors.text },
  emptyBody: { fontSize: typography.sizes.sm, color: colors.textMuted, textAlign: 'center' },
});
