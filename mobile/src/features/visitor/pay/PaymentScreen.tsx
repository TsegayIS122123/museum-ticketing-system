import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { colors, spacing, typography } from '@/theme';
import { openChapaCheckout } from './checkout';
import { useBookingPolling, type Booking } from '@/api/queries/payments';
import { formatEtb } from '@/utils/money';
import { formatDateOnly } from '@/utils/dates';

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 60_000;

type Phase = 'ready-to-pay' | 'opening-browser' | 'confirming' | 'success' | 'timeout';

export function PaymentScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ bookingId?: string; checkoutUrl?: string }>();

  const bookingId = typeof params.bookingId === 'string' ? params.bookingId : null;
  const checkoutUrl = typeof params.checkoutUrl === 'string' ? params.checkoutUrl : null;

  const [phase, setPhase] = useState<Phase>('ready-to-pay');
  const [elapsed, setElapsed] = useState(0);

  const pollingEnabled = phase === 'confirming';
  const { data: booking, refetch, isFetching } = useBookingPolling(bookingId, {
    enabled: pollingEnabled,
    intervalMs: POLL_INTERVAL_MS,
    timeoutMs: POLL_TIMEOUT_MS,
  });

  // Watch for status change → success
  useEffect(() => {
    if (!booking) return;
    if (booking.status === 'pending') {
      setPhase('success');
    } else if (
      booking.status === 'cancelled' ||
      booking.status === 'refunded'
    ) {
      // Server says the booking is no longer payable; surface it as a failure.
      Alert.alert(
        t('paymentNotCompleted', 'Payment not completed'),
        t('paymentNotCompletedBody', 'The booking was cancelled or refunded before payment was confirmed.')
      );
      router.replace('/(visitor)/(tabs)/book' as any);
    }
  }, [booking, router, t]);

  // Enforce the 60s timeout locally
  useEffect(() => {
    if (phase !== 'confirming') return;
    const startedAt = Date.now();
    const id = setInterval(() => {
      const s = Math.floor((Date.now() - startedAt) / 1000);
      setElapsed(s);
      if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
        clearInterval(id);
        setPhase('timeout');
      }
    }, 1000);
    return () => clearInterval(id);
  }, [phase]);

  const handleOpenCheckout = useCallback(async () => {
    if (!checkoutUrl) {
      Alert.alert(
        t('paymentMissingUrl', 'Missing checkout URL'),
        t('paymentMissingUrlBody', 'No checkout URL was provided. Please start the booking again.')
      );
      return;
    }
    setPhase('opening-browser');
    try {
      await openChapaCheckout(checkoutUrl);
    } catch (err) {
      // Non-fatal — still try polling.
    }
    setPhase('confirming');
  }, [checkoutUrl, t]);

  const handleRetry = useCallback(async () => {
    setPhase('confirming');
    setElapsed(0);
    await refetch();
  }, [refetch]);

  const handleConfirmManually = useCallback(async () => {
    await refetch();
  }, [refetch]);

  const handleDone = useCallback(() => {
    router.replace('/(visitor)/(tabs)/tickets' as any);
  }, [router]);

  const isAm = i18n.language === 'am';

  const summary = useMemo(() => {
    if (!booking) return null;
    return (
      <Card>
        <Row label={t('reference', 'Reference')} value={booking.reference} mono />
        <Row label={t('visitDate', 'Visit date')} value={formatDateOnly(booking.visit_date, 'EEEE, d MMM yyyy')} />
        <Row label={t('total', 'Total')} value={formatEtb(booking.total_amount_etb)} bold />
      </Card>
    );
  }, [booking, t]);

  if (!bookingId || !checkoutUrl) {
    return (
      <Screen>
        <View style={styles.center}>
          <Text style={styles.errorText}>
            {t('paymentMissingContext', 'Payment information missing. Please start over.')}
          </Text>
          <Button
            label={t('back', 'Back')}
            onPress={() => router.replace('/(visitor)/(tabs)/book' as any)}
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.scroll}>
        {phase === 'ready-to-pay' && (
          <>
            <Text style={styles.title}>{t('payTitle', 'Complete payment')}</Text>
            <Text style={styles.subtitle}>
              {t(
                'paySubtitle',
                'You will be redirected to Chapa to pay by Telebirr, CBE Birr, or card. Return to the app once done.'
              )}
            </Text>
            {summary}
            <Button
              label={t('openCheckout', 'Open secure checkout')}
              onPress={handleOpenCheckout}
            />
          </>
        )}

        {phase === 'opening-browser' && (
          <View style={styles.center}>
            <ActivityIndicator color={colors.brandPrimary} size="large" />
            <Text style={styles.status}>{t('openingBrowser', 'Opening secure checkout…')}</Text>
          </View>
        )}

        {phase === 'confirming' && (
          <>
            <View style={styles.center}>
              <ActivityIndicator color={colors.brandPrimary} size="large" />
              <Text style={styles.status}>
                {t('confirmingPayment', 'Confirming your payment…')}
              </Text>
              <Text style={styles.hint}>
                {t('confirmingPaymentHint', 'This usually takes a few seconds.')}
                {'  '}
                {elapsed}s / {POLL_TIMEOUT_MS / 1000}s
              </Text>
            </View>
            {summary}
            <Button
              label={t('checkStatusNow', 'Check status now')}
              variant="secondary"
              onPress={handleConfirmManually}
              loading={isFetching}
            />
          </>
        )}

        {phase === 'success' && booking && (
          <>
            <View style={styles.center}>
              <View style={styles.successCircle}>
                <Text style={styles.successCheck}>✓</Text>
              </View>
              <Text style={styles.successTitle}>
                {t('paymentSuccessTitle', 'Payment confirmed')}
              </Text>
              <Text style={styles.successBody}>
                {t('paymentSuccessBody', 'Your booking is confirmed. Show your ticket at the gate.')}
              </Text>
            </View>
            {summary}
            <Button label={t('viewTicket', 'View ticket')} onPress={handleDone} />
          </>
        )}

        {phase === 'timeout' && booking && (
          <>
            <View style={styles.center}>
              <Text style={styles.warnTitle}>
                {t('paymentNotReceivedTitle', 'Payment not received yet')}
              </Text>
              <Text style={styles.warnBody}>
                {t(
                  'paymentNotReceivedBody',
                  'We have not seen a confirmation from Chapa. If you completed payment, tap Retry. If not, you can retry the checkout — the same session will be reused.'
                )}
              </Text>
            </View>
            {summary}
            <Button
              label={t('retryCheck', 'Retry check')}
              onPress={handleRetry}
            />
            <View style={{ height: spacing.md }} />
            <Button
              label={t('reopenCheckout', 'Reopen checkout')}
              variant="secondary"
              onPress={handleOpenCheckout}
            />
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

function Row({
  label,
  value,
  bold,
  mono,
}: {
  label: string;
  value: string;
  bold?: boolean;
  mono?: boolean;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, bold && styles.rowValueBold, mono && styles.rowValueMono]}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.lg },
  center: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.xl, gap: spacing.md },
  title: { fontSize: typography.sizes.xl, fontWeight: '700', color: colors.text },
  subtitle: { fontSize: typography.sizes.sm, color: colors.textMuted, marginBottom: spacing.md },
  status: { fontSize: typography.sizes.md, color: colors.text, fontWeight: '600', marginTop: spacing.md },
  hint: { fontSize: typography.sizes.xs, color: colors.textMuted },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.sm },
  rowLabel: { fontSize: typography.sizes.sm, color: colors.textMuted },
  rowValue: { fontSize: typography.sizes.sm, color: colors.text, fontWeight: '600' },
  rowValueBold: { fontSize: typography.sizes.md, fontWeight: '700', color: colors.brandPrimary },
  rowValueMono: { fontFamily: typography.fontFamily.latin, letterSpacing: 1 },
  errorText: { color: colors.danger, textAlign: 'center', marginBottom: spacing.md },
  successCircle: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: colors.success,
    alignItems: 'center', justifyContent: 'center',
  },
  successCheck: { color: colors.textInverse, fontSize: 40, fontWeight: '700' },
  successTitle: { fontSize: typography.sizes.xl, fontWeight: '700', color: colors.text, marginTop: spacing.md },
  successBody: { fontSize: typography.sizes.sm, color: colors.textMuted, textAlign: 'center' },
  warnTitle: { fontSize: typography.sizes.lg, fontWeight: '700', color: colors.warning },
  warnBody: { fontSize: typography.sizes.sm, color: colors.textMuted, textAlign: 'center', lineHeight: 20 },
});
