import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { Card } from '@/components/ui/Card';
import { colors, radius, spacing, typography } from '@/theme';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { formatEtb } from '@/utils/money';
import { formatDateOnly } from '@/utils/dates';
import type { MyBooking } from '@/api/queries/bookings';

interface BookingCardProps {
  booking: MyBooking;
}

export function BookingCard({ booking }: BookingCardProps) {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const isAm = i18n.language === 'am';

  const firstItem = booking.items?.[0];

  const categoryName = isAm
    ? firstItem?.categoryNameAm ?? ''
    : firstItem?.categoryNameEn ?? '';

  return (
    <Pressable onPress={() => router.push(`/(visitor)/bookings/${booking.id}` as any)}>
      <Card style={styles.card}>
        <View style={styles.row}>
          <Text style={styles.ref}>{booking.reference}</Text>
          <StatusBadge status={booking.status} />
        </View>
        <Text style={styles.date}>{formatDateOnly(booking.visitDate, 'EEE, d MMM yyyy')}</Text>
        {categoryName ? (
          <Text style={styles.category}>
            {categoryName}
            {booking.bookedQuantity ? ` × ${booking.bookedQuantity}` : ''}
          </Text>
        ) : null}
        <Text style={styles.total}>{formatEtb(booking.totalAmountEtb)}</Text>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: spacing.md },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  ref: { fontFamily: typography.fontFamily.latin, fontSize: typography.sizes.sm, fontWeight: '700', color: colors.text, letterSpacing: 2 },
  date: { fontSize: typography.sizes.sm, color: colors.textMuted, marginTop: spacing.sm },
  category: { fontSize: typography.sizes.sm, color: colors.text, marginTop: 2 },
  total: { fontSize: typography.sizes.md, fontWeight: '700', color: colors.brandPrimary, marginTop: spacing.sm },
});
