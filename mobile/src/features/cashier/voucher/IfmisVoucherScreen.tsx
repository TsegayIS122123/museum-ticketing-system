import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { Screen } from '@/components/ui/Screen';
import { Button } from '@/components/ui/Button';
import { colors, spacing, typography } from '@/theme';
import { useVoucher } from '@/api/queries/ifmis-voucher';
import { VoucherForm } from './VoucherForm';

export function IfmisVoucherScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ bookingId?: string }>();
  const bookingId = typeof params.bookingId === 'string' ? params.bookingId : null;

  const { data: voucher, isLoading, isError, refetch } = useVoucher(bookingId);

  if (!bookingId) {
    return (
      <Screen>
        <View style={styles.center}>
          <Text style={styles.error}>
            {t('voucherMissingBooking', 'Booking information missing.')}
          </Text>
          <Button label={t('back', 'Back')} onPress={() => router.back()} />
        </View>
      </Screen>
    );
  }

  if (isLoading) {
    return (
      <Screen>
        <View style={styles.center}>
          <ActivityIndicator color={colors.brandPrimary} size="large" />
        </View>
      </Screen>
    );
  }

  if (isError || !voucher) {
    return (
      <Screen>
        <View style={styles.center}>
          <Text style={styles.error}>{t('commonErrorGeneric', 'Something went wrong')}</Text>
          <Button label={t('retry', 'Retry')} onPress={() => refetch()} />
          <Button label={t('back', 'Back')} variant="secondary" onPress={() => router.back()} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <Text style={styles.title}>{t('ifmisVoucherTitle', 'IFMIS voucher')}</Text>
          <Text style={styles.subtitle}>
            {t('voucherRefLine', 'Booking')} {voucher.reference}
          </Text>
        </View>

        <VoucherForm
          bookingId={bookingId}
          voucher={voucher}
          onSuccess={() => refetch()}
        />

        <Button
          label={t('back', 'Back')}
          variant="secondary"
          onPress={() => router.back()}
        />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: spacing.lg, gap: spacing.md },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.md },
  header: { marginBottom: spacing.sm },
  title: { fontSize: typography.sizes.xl, fontWeight: '700', color: colors.text },
  subtitle: { fontSize: typography.sizes.sm, color: colors.textMuted, marginTop: spacing.xs, fontFamily: typography.fontFamily.latin },
  error: { color: colors.danger },
});
