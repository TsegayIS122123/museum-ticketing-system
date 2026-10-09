import { useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { Screen } from '@/components/ui/Screen';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { colors, spacing, typography } from '@/theme';
import { useQuery } from '@tanstack/react-query';
import { fetchBooking } from '@/api/queries/payments';
import { formatEtb } from '@/utils/money';
import { formatDateOnly } from '@/utils/dates';
import { TicketQR } from './TicketQR';
import { CancelModal } from './CancelModal';
import { RescheduleModal } from './RescheduleModal';

export function TicketDetail() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const id = typeof params.id === 'string' ? params.id : null;
  const isAm = i18n.language === 'am';

  const [cancelOpen, setCancelOpen] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);

  const { data: booking, isLoading, isError, refetch } = useQuery({
    queryKey: ['booking', id],
    queryFn: () => fetchBooking(id!),
    enabled: !!id,
  });

  if (!id || isLoading) {
    return (
      <Screen>
        <View style={styles.center}>
          <ActivityIndicator color={colors.brandPrimary} size="large" />
        </View>
      </Screen>
    );
  }

  if (isError || !booking) {
    return (
      <Screen>
        <View style={styles.center}>
          <Text style={styles.error}>{t('commonErrorGeneric', 'Something went wrong')}</Text>
          <Button label={t('retry', 'Retry')} onPress={() => refetch()} />
        </View>
      </Screen>
    );
  }

  const canCancelOrReschedule = booking.status === 'pending';

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.topRow}>
          <Text style={styles.reference}>{booking.reference}</Text>
          <StatusBadge status={booking.status} />
        </View>

        {/* QR — only shown while the booking can be presented at the gate */}
        {booking.status === 'pending' ? (
          <Card style={styles.qrCard}>
            <TicketQR reference={booking.reference} size={240} />
          </Card>
        ) : null}

        <Card>
          <Row label={t('visitDate', 'Visit date')} value={formatDateOnly(booking.visit_date, 'EEEE, d MMMM yyyy')} />
          <Row label={t('total', 'Total')} value={formatEtb(booking.total_amount_etb)} bold />
          {booking.items?.length
            ? booking.items.map((it, i) => (
                <Row
                  key={i}
                  label={isAm ? it.categoryNameAm ?? '' : it.categoryNameEn ?? ''}
                  value={`${it.quantity ?? 1}`}
                />
              ))
            : null}
        </Card>

        {canCancelOrReschedule ? (
          <View style={styles.actions}>
            <Button
              label={t('rescheduleBooking', 'Reschedule')}
              variant="secondary"
              onPress={() => setRescheduleOpen(true)}
            />
            <View style={{ height: spacing.sm }} />
            <Button
              label={t('cancelBooking', 'Cancel booking')}
              variant="danger"
              onPress={() => setCancelOpen(true)}
            />
          </View>
        ) : null}

        <Button
          label={t('back', 'Back')}
          variant="secondary"
          onPress={() => router.push('/(visitor)/(tabs)/tickets' as any)}
        />
      </ScrollView>

      <CancelModal
        visible={cancelOpen}
        bookingId={booking.id}
        onClose={() => setCancelOpen(false)}
        onSuccess={() => router.replace('/(visitor)/(tabs)/tickets' as any)}
      />

      <RescheduleModal
        visible={rescheduleOpen}
        bookingId={booking.id}
        currentVisitDate={booking.visit_date}
        onClose={() => setRescheduleOpen(false)}
        onSuccess={() => refetch()}
      />
    </Screen>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, bold && styles.rowValueBold]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.md },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.md },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  reference: { fontFamily: typography.fontFamily.latin, fontSize: typography.sizes.lg, fontWeight: '700', color: colors.text, letterSpacing: 3 },
  qrCard: { alignItems: 'center', paddingVertical: spacing.xl },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.sm },
  rowLabel: { fontSize: typography.sizes.sm, color: colors.textMuted, flex: 1 },
  rowValue: { fontSize: typography.sizes.sm, color: colors.text, fontWeight: '600' },
  rowValueBold: { fontSize: typography.sizes.md, color: colors.brandPrimary, fontWeight: '700' },
  actions: { marginTop: spacing.md },
  error: { color: colors.danger },
});
