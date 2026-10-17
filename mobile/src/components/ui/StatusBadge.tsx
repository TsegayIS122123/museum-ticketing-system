import { StyleSheet, View } from 'react-native';
import { AppText as Text } from '@/components/ui/AppText';
import { useTranslation } from 'react-i18next';
import { radius, spacing, typography } from '@/theme';

export type BookingStatus =
  | 'awaiting_payment'
  | 'pending'
  | 'visited'
  | 'cancelled'
  | 'refunded';

interface StatusConfig {
  bg: string;
  fg: string;
}

// Status colours mirror the web StatusBadge palette. The label is resolved
// from i18n using the status itself as the key (same keys as the web app),
// so Amharic is translated instead of showing hardcoded English.
const CONFIG: Record<BookingStatus, StatusConfig> = {
  awaiting_payment: { bg: '#FEF3C7', fg: '#92400E' },
  pending: { bg: '#DBEAFE', fg: '#1E40AF' },
  visited: { bg: '#D1FAE5', fg: '#065F46' },
  cancelled: { bg: '#E5E7EB', fg: '#374151' },
  refunded: { bg: '#FEE2E2', fg: '#991B1B' },
};

interface StatusBadgeProps {
  status: BookingStatus;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const { t } = useTranslation();
  const config = CONFIG[status] ?? CONFIG.pending;
  return (
    <View style={[styles.badge, { backgroundColor: config.bg }]}>
      <Text style={[styles.label, { color: config.fg }]}>{t(status)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
  },
  label: {
    fontSize: typography.sizes.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
