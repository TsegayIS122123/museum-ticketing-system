import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Card } from '@/components/ui/Card';
import { colors, radius, spacing, typography } from '@/theme';
import { formatEtb } from '@/utils/money';
import type { OutstandingBalance } from '@/api/queries/settlement';

interface BalanceCardProps {
  balance: OutstandingBalance;
}

export function BalanceCard({ balance }: BalanceCardProps) {
  const { t } = useTranslation();

  return (
    <Card style={styles.card}>
      <Text style={styles.label}>{t('outstandingBalance', 'Outstanding balance')}</Text>
      <Text style={styles.amount}>{formatEtb(balance.outstanding_etb)}</Text>
      {balance.booking_count !== undefined ? (
        <Text style={styles.sub}>
          {t('balanceBookings', 'Across {{n}} booking(s)', { n: balance.booking_count })}
        </Text>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { paddingVertical: spacing.xl, alignItems: 'center' },
  label: {
    fontSize: typography.sizes.xs,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontWeight: '600',
  },
  amount: {
    fontSize: 40,
    fontWeight: '700',
    color: colors.brandPrimary,
    fontFamily: typography.fontFamily.latin,
    marginVertical: spacing.md,
  },
  sub: { fontSize: typography.sizes.sm, color: colors.textMuted },
});
