import { StyleSheet, View } from 'react-native';
import { AppText as Text } from '@/components/ui/AppText';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';

import { Card } from '@/components/ui/Card';
import { colors, radius, spacing, typography } from '@/theme';
import { formatEtb } from '@/utils/money';
import { formatDateTime } from '@/utils/dates';
import type { Refund, RefundReason, RefundStatus } from '@/api/queries/manager-refunds';

/**
 * A UUID is 36 characters and unreadable inside a card row, so the row
 * shows the first 8 (enough to match against the audit log or a support
 * conversation) and keeps the full value for screen readers.
 */
function shortId(id: string): string {
  return `#${id.slice(0, 8).toUpperCase()}`;
}

/**
 * Reason labels reuse the catalog keys that already hold them: the
 * `Refund.Reason` literals (`cancellation`, `partial_shortfall`,
 * `no_response`, `category_correction`) are exactly the i18n keys the web
 * refunds page translates, so no second set of synonym keys is needed.
 */
function reasonLabel(t: TFunction, reason: RefundReason): string {
  return t(reason, reason.replace(/_/g, ' '));
}

/**
 * Mirrors `features/cashier/settlement/HistoryList`'s `statusStyle`: the
 * refund and the reconciliation share the same tri-state, and both use the
 * `statusPending` / `statusCompleted` / `statusFailed` keys that already
 * exist in the catalogs. Not `components/ui/StatusBadge`, which renders
 * *booking* statuses and would label a completed refund "Visited".
 */
function statusStyle(status: RefundStatus, t: TFunction) {
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

export function RefundRow({ refund }: { refund: Refund }) {
  const { t } = useTranslation();
  const badge = statusStyle(refund.status, t);

  return (
    <Card style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.reference} accessibilityLabel={refund.id}>
          {shortId(refund.id)}
        </Text>
        <View style={[styles.badge, badge.bg]}>
          <Text style={[styles.badgeText, badge.fg]}>{badge.label}</Text>
        </View>
      </View>

      <Text style={styles.amount}>{formatEtb(refund.amountEtb)}</Text>

      <Row
        label={t('booking', 'Booking')}
        value={shortId(refund.bookingId)}
        accessibilityLabel={refund.bookingId}
      />
      <Row label={t('reason', 'Reason')} value={reasonLabel(t, refund.reason)} />
      <Row label={t('date', 'Date')} value={formatDateTime(refund.createdAt)} />

      {refund.chapaRefundReference ? (
        <Text style={styles.chapaRef}>
          {t('managerRefundsChapaRef', 'Chapa refund ref')}: {refund.chapaRefundReference}
        </Text>
      ) : null}
    </Card>
  );
}

function Row({
  label,
  value,
  accessibilityLabel,
}: {
  label: string;
  value: string;
  accessibilityLabel?: string;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue} accessibilityLabel={accessibilityLabel}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: spacing.md, gap: spacing.xs },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  reference: {
    fontFamily: typography.fontFamily.latin,
    fontSize: typography.sizes.sm,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 1,
  },
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  badgeText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  amount: {
    fontFamily: typography.fontFamily.latin,
    fontSize: typography.sizes.lg,
    fontWeight: '700',
    color: colors.brandPrimary,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
  },
  rowLabel: { fontSize: typography.sizes.sm, color: colors.textMuted },
  rowValue: {
    fontFamily: typography.fontFamily.latin,
    fontSize: typography.sizes.sm,
    color: colors.text,
    fontWeight: '600',
  },
  chapaRef: {
    fontSize: typography.sizes.xs,
    color: colors.textMuted,
    fontFamily: typography.fontFamily.latin,
    marginTop: spacing.xs,
  },
});
