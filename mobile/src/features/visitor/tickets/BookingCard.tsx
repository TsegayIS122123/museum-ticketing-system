import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { AppText as Text } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { colors, spacing, typography } from '@/theme';
import { formatDateOnly } from '@/utils/dates';
import type { MyBooking } from '@/api/queries/bookings';

interface BookingCardProps {
  booking: MyBooking;
}

export function BookingCard({ booking }: BookingCardProps) {
  const router = useRouter();

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push(`/(visitor)/bookings/${booking.id}` as any)}
    >
      <Card>
        <View style={styles.header}>
          <Text style={styles.reference}>{booking.reference}</Text>
          <StatusBadge status={booking.status} />
        </View>
        <View style={styles.meta}>
          <Text style={styles.label}>Visit date</Text>
          <Text style={styles.value}>{formatDateOnly(booking.visitDate)}</Text>
        </View>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  reference: { color: colors.text, fontSize: typography.sizes.md, fontWeight: '700' },
  meta: { marginTop: spacing.sm, gap: 2 },
  label: { color: colors.textMuted, fontSize: typography.sizes.xs },
  value: { color: colors.text, fontSize: typography.sizes.sm, fontWeight: '600' },
});
