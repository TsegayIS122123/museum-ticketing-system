import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { AppText as Text } from '@/components/ui/AppText';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';

import { Screen } from '@/components/ui/Screen';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { colors, spacing, typography } from '@/theme';
import { getAccessToken } from '@/auth/session';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { API_BASE_URL } from '@/constants/config';
import { fetchBooking } from '@/api/queries/payments';
import { formatEtb } from '@/utils/money';
import { formatDateOnly } from '@/utils/dates';
import { TicketQR } from './TicketQR';
import { CancelModal } from './CancelModal';
import { RescheduleModal } from './RescheduleModal';
import { type CachedTicket } from '@/database/tickets';

interface ViewModel {
  id: string;
  reference: string;
  status: string;
  visitDate: string;
  totalAmountEtb: string;
  items?: { categoryNameEn?: string; categoryNameAm?: string; quantity?: number }[];
  fromCache: boolean;
}

export function TicketDetail() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const id = typeof params.id === 'string' ? params.id : null;
  const isAm = i18n.language === 'am';

  const [cancelOpen, setCancelOpen] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [cached, setCached] = useState<CachedTicket | null>(null);

  const {
    data: liveBooking,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['booking', id],
    queryFn: () => fetchBooking(id!),
    enabled: !!id,
    retry: 1,
  });

  useEffect(() => {
    if (!id) return;
    if (isError && !liveBooking) {
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

  const isAwaitingPayment = vm.status === 'awaiting_payment';
  const isPaid = vm.status === 'pending' || vm.status === 'visited';
  const canCancelOrReschedule = isPaid && !vm.fromCache;

  const handleDownloadReceipt = async () => {
    try {
      const token = await getAccessToken();
      const endpoint = `${API_BASE_URL}/api/v1/bookings/${vm.id}/receipt/download/`;
      const headers = token ? { Authorization: `Bearer ${token}` } : undefined;

      if (Platform.OS === 'web') {
        const response = await fetch(endpoint, { headers });
        if (!response.ok) throw new Error(`Receipt download failed: ${response.status}`);
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = 'receipt.pdf';
        anchor.click();
        URL.revokeObjectURL(url);
        return;
      }

      const directory = FileSystem.documentDirectory;
      if (!directory) throw new Error('Document storage is unavailable.');
      const fileUri = `${directory}receipt.pdf`;
      await FileSystem.deleteAsync(fileUri, { idempotent: true });
      const result = await FileSystem.downloadAsync(endpoint, fileUri, { headers });
      if (result.status < 200 || result.status >= 300) {
        throw new Error(`Receipt download failed: ${result.status}`);
      }
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(result.uri, {
          mimeType: 'application/pdf',
          UTI: 'com.adobe.pdf',
        });
      } else {
        Alert.alert(
          t('receiptDownloaded', 'Receipt downloaded'),
          t('receiptDownloadedBody', 'The receipt was saved to your device.')
        );
      }
    } catch {
      Alert.alert(
        t('downloadReceiptFailed', 'Download failed'),
        t('downloadReceiptFailedBody', 'Unable to download the receipt. Please try again.')
      );
    }
  };

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

        {isPaid ? (
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

        {isAwaitingPayment ? (
          <Button
            label={t('payNow', 'Pay Now')}
            onPress={() => router.push('/(visitor)/book/payment') as any}
          />
        ) : null}

        {isPaid ? (
          <View style={styles.actions}>
            <Button
              label={t('downloadReceipt', 'Download Receipt')}
              onPress={handleDownloadReceipt}
            />
            {canCancelOrReschedule ? (
              <>
                <View style={{ height: spacing.sm }} />
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
              </>
            ) : null}
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
