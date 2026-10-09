import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '@/theme';

export type BookingStatus =
  | 'awaiting_payment'
  | 'pending'
  | 'visited'
  | 'cancelled'
  | 'refunded';

interface StatusConfig {
  bg: string;
  fg: string;
  label: string;
}

const CONFIG: Record<BookingStatus, StatusConfig> = {
  awaiting_payment: { bg: '#FEF3C7', fg: '#92400E', label: 'Awaiting Payment' },
  pending: { bg: '#DBEAFE', fg: '#1E40AF', label: 'Pending' },
  visited: { bg: '#D1FAE5', fg: '#065F46', label: 'Visited' },
  cancelled: { bg: '#E5E7EB', fg: '#374151', label: 'Cancelled' },
  refunded: { bg: '#FEE2E2', fg: '#991B1B', label: 'Refunded' },
};

interface StatusBadgeProps {
  status: BookingStatus;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const config = CONFIG[status] ?? CONFIG.pending;
  return (
    <View style={[styles.badge, { backgroundColor: config.bg }]}>
      <Text style={[styles.label, { color: config.fg }]}>{config.label}</Text>
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
