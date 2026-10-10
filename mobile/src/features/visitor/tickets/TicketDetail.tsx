import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';

import { Screen } from '@/components/ui/Screen';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { colors, spacing, typography } from '@/theme';
import { fetchBooking } from '@/api/queries/payments';
import { formatEtb } from '@/utils/money';
import { formatDateOnly } from '@/utils/dates';
import { TicketQR } from './TicketQR';
import { CancelModal } from './CancelModal';
import { RescheduleModal } from './RescheduleModal';
import { readCachedTicket, type CachedTicket } from '@/database/tickets';
import { useOffline } from '@/features/shared/useOffline';

interface ViewModel {
  id: string;
  reference: string;
  status: string;
  visitDate: string;
  totalAmountEtb: string;
  items?: Array<{ categoryNameEn?: string; categoryNameAm?: string; quantity?: number }>;
  fromCache: boolean;
}

export function TicketDetail() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const id = typeof params.id === 'string' ? params.id : null;
  const isAm = i18n.language === 'am';
  const offline = useOffline();

  const [cancelOpen, setCancelOpen] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [cached, setCached] = useState<CachedTicket | null>(null);

  const {
    data: liveBooking,
    isLoading,
    isError,
    refetch,
    failureCount,
  } = useQuery({
    queryKey: ['booking', id],
    queryFn: () => fetchBooking(id!),
    enabled: !!id,
    retry: 1,
  });

  // If the network fetch fails, try the cache
  useEffect(() => {
    if (!id) return;
    if (isError && !liveBooking) {
      // No reference known until we've cached at least once; try the cache
      // keyed by any reference (we store by reference, so we need a lookup
      // helper). Fallback: scan the full cache for this booking_id.
      (async () => {
        const { listCachedTickets } = await import('@/database/tickets');
        const all = await listCachedTickets();
        const hit = all.find((c) => c.bookingId === id);
        if (hit) setCached(hit);
      })();
    }
  }, [id, isError, liveBooking]);

  const vm: ViewModel | null = liveBooking
    ? {
        id: liveBooking.id,
        reference: liveBooking.reference,
        status: liveBooking.status,
        visitDate: liveBooking.visitDate,
        totalAmountEtb: liveBooking.totalAmountEtb,
        items: liveBooking.items,
        fromCache: false,
      }
    : cached
    ? {
        id: cached.bookingId,
        reference: cached.reference,
        status: cached.status,
        visitDate: cached.visitDate,
        totalAmountEtb: cached.totalEtb ?? '0.00',
        items: cached.categoryNameEn || cached.categoryNameAm
          ? [{
              categoryNameEn: cached.categoryNameEn ?? undefined,
              categoryNameAm: cached.categoryNameAm ?? undefined,
              quantity: cached.quantity ?? 1,
            }]
          : undefined,
        fromCache: true,
      }
    : null;

  if (!id || (isLoading && !vm)) {
    return (
      <Screen>
        <View style={styles.center}>
          <ActivityIndicator color={colors.brandPrimary} size="large" />
        </View>
      </Screen>
    );
  }

  if (!vm) {
    return (
      <Screen>
        <View style={styles.center}>
          <Text style={styles.error}>
            {t('bookingNotFoundOffline', 'This ticket is not available offline.')}
          </Text>
          <Button label={t('retry', 'Retry')} onPress={() => refetch()} />
          <Button
            label={t('back', 'Back')}
            variant="secondary"
            onPress={() => router.push('/(visitor)/(tabs)/tickets' as any)}
          />
        </View>
      </Screen>
    );
  }

  const canCancelOrReschedule = vm.status === 'pending' && !vm.fromCache;

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.scroll}>
        {vm.fromCache ? (
          <View style={styles.cacheNote}>
            <Text style={styles.cacheNoteText}>
              {t('offlineTicketNote', 'Showing cached ticket — connect to make changes.')}
            </Text>
          </View>
        ) : null}

        <View style={styles.topRow}>
          <Text style={styles.reference}>{vm.reference}</Text>
          <StatusBadge status={vm.status as any} />
        </View>

        {vm.status === 'pending' ? (
          <Card style={styles.qrCard}>
            <TicketQR reference={vm.reference} size={240} />
          </Card>
        ) : null}

        <Card>
          <Row
            label={t('visitDate', 'Visit date')}
            value={formatDateOnly(vm.visitDate, 'EEEE, d MMMM yyyy')}
          />
          <Row label={t('total', 'Total')} value={formatEtb(vm.totalAmountEtb)} bold />
          {vm.items?.length
            ? vm.items.map((it, i) => (
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
        bookingId={vm.id}
        onClose={() => setCancelOpen(false)}
        onSuccess={() => router.replace('/(visitor)/(tabs)/tickets' as any)}
      />

      <RescheduleModal
        visible={rescheduleOpen}
        bookingId={vm.id}
        currentVisitDate={vm.visitDate}
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
  cacheNote: {
    backgroundColor: colors.warning,
    padding: spacing.sm,
    borderRadius: 8,
  },
  cacheNoteText: { color: '#FFFFFF', fontSize: typography.sizes.xs, fontWeight: '600', textAlign: 'center' },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  reference: { fontFamily: typography.fontFamily.latin, fontSize: typography.sizes.lg, fontWeight: '700', color: colors.text, letterSpacing: 3 },
  qrCard: { alignItems: 'center', paddingVertical: spacing.xl },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.sm },
  rowLabel: { fontSize: typography.sizes.sm, color: colors.textMuted, flex: 1 },
  rowValue: { fontSize: typography.sizes.sm, color: colors.text, fontWeight: '600' },
  rowValueBold: { fontSize: typography.sizes.md, color: colors.brandPrimary, fontWeight: '700' },
  actions: { marginTop: spacing.md },
  error: { color: colors.danger, textAlign: 'center' },
});
