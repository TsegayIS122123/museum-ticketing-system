import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { AppText as Text } from '@/components/ui/AppText';
import { Screen } from '@/components/ui/Screen';
import { Button } from '@/components/ui/Button';
import { colors, spacing, typography } from '@/theme';
import { useMyBookings } from '@/api/queries/bookings';
import { BookingCard } from './BookingCard';

export function BookingList() {
  const { t } = useTranslation();
  const { data, isLoading, isError, refetch } = useMyBookings();
  const bookings = data ?? [];

  if (isLoading) {
    return (
      <Screen>
        <View style={styles.center}>
          <ActivityIndicator color={colors.brandPrimary} size="large" />
        </View>
      </Screen>
    );
  }

  if (isError) {
    return (
      <Screen>
        <View style={styles.center}>
          <Text style={styles.error}>{t('bookingsLoadFailed', 'Could not load bookings.')}</Text>
          <Button label={t('retry', 'Retry')} onPress={() => refetch()} />
        </View>
      </Screen>
    );
  }

  if (bookings.length === 0) {
    return (
      <Screen>
        <View style={styles.center}>
          <Text style={styles.empty}>{t('noBookingsYet', 'No bookings yet.')}</Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.list}>
        {bookings.map((booking) => (
          <BookingCard key={booking.id} booking={booking} />
        ))}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg, gap: spacing.md },
  list: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxxl },
  error: { color: colors.danger, textAlign: 'center' },
  empty: { color: colors.textMuted, fontSize: typography.sizes.md, textAlign: 'center' },
});
