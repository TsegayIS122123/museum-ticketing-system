import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/Button';
import { colors, spacing, typography } from '@/theme';
import { useMyBookings } from '@/api/queries/bookings';
import { BookingCard } from './BookingCard';

export function BookingList() {
  const { t } = useTranslation();
  const router = useRouter();
  const { data, isLoading, isError, refetch, isRefetching } = useMyBookings();

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.brandPrimary} size="large" />
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{t('commonErrorGeneric', 'Something went wrong')}</Text>
        <Button label={t('retry', 'Retry')} onPress={() => refetch()} />
      </View>
    );
  }

  if (!data || data.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyTitle}>{t('noBookingsTitle', 'No bookings yet')}</Text>
        <Text style={styles.emptyBody}>
          {t('noBookingsBody', 'Book your first visit to the museum.')}
        </Text>
        <Button
          label={t('bookNow', 'Book now')}
          onPress={() => router.push('/(visitor)/book/new' as any)}
        />
      </View>
    );
  }

  return (
    <FlatList
      data={data}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => <BookingCard booking={item} />}
      contentContainerStyle={styles.list}
      refreshControl={
        <RefreshControl
          refreshing={isRefetching}
          onRefresh={refetch}
          colors={[colors.brandPrimary]}
          tintColor={colors.brandPrimary}
        />
      }
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.md },
  list: { padding: spacing.lg },
  error: { color: colors.danger, marginBottom: spacing.md },
  emptyTitle: { fontSize: typography.sizes.lg, fontWeight: '700', color: colors.text },
  emptyBody: { fontSize: typography.sizes.sm, color: colors.textMuted, textAlign: 'center', marginBottom: spacing.md },
});
