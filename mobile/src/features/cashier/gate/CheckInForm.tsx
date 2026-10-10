import { useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { colors, radius, spacing, typography } from '@/theme';
import { useCheckIn, type GateBooking } from '@/api/queries/gate';
import { isApiError } from '@/api/errors';
import { useOffline } from '@/features/shared/useOffline';

interface CheckInFormProps {
  booking: GateBooking;
  onSuccess: (attended: number) => void;
}

export function CheckInForm({ booking, onSuccess }: CheckInFormProps) {
  const { t } = useTranslation();
  const checkIn = useCheckIn();
  const offline = useOffline();

  const bookedTotal = useMemo(
    () =>
      booking.bookedQuantity ??
      booking.items?.reduce((sum, it) => sum + (it.quantity ?? 0), 0) ??
      1,
    [booking]
  );
  const [attended, setAttended] = useState(bookedTotal);
  const [inputText, setInputText] = useState(String(bookedTotal));

  const shortfall = bookedTotal - attended;

  const setBoth = (n: number) => {
    const clamped = Math.max(0, Math.min(bookedTotal, Math.floor(n)));
    setAttended(clamped);
    setInputText(String(clamped));
  };

  const onChangeText = (v: string) => {
    setInputText(v);
    const n = parseInt(v, 10);
    if (!isNaN(n)) setAttended(Math.max(0, Math.min(bookedTotal, n)));
  };

  const handleConfirm = async () => {
    if (attended > bookedTotal) {
      Alert.alert(
        t('overAttended', 'Too many attendees'),
        t('overAttendedBody', 'Extra visitors must book separately.')
      );
      return;
    }

    // Offline: skip the network call entirely. The caller (ScanScreen)
    // will enqueue the check-in in the SQLite sync queue.
    if (offline) {
      onSuccess(attended);
      return;
    }

    try {
      await checkIn.mutateAsync({ bookingId: booking.id });
      onSuccess(attended);
    } catch (err) {
      const msg = isApiError(err) ? err.message : t('commonErrorGeneric', 'Something went wrong');
      Alert.alert(t('checkInFailed', 'Check-in failed'), msg);
    }
  };

  return (
    <Card>
      <Text style={styles.title}>{t('recordAttendance', 'Record attendance')}</Text>
      <Text style={styles.booked}>
        {t('bookedTotal', 'Booked')}: <Text style={styles.bookedValue}>{bookedTotal}</Text>
      </Text>

      {offline ? (
        <View style={styles.offlineNote}>
          <Text style={styles.offlineNoteText}>
            {t('offlineCheckInNote', 'You are offline — this check-in will be queued and synced when you reconnect.')}
          </Text>
        </View>
      ) : null}

      <View style={styles.stepperRow}>
        <View style={styles.stepper}>
          <Text style={styles.stepBtn} onPress={() => setBoth(attended - 1)}>
            −
          </Text>
          <TextInput
            style={styles.input}
            keyboardType="number-pad"
            value={inputText}
            onChangeText={onChangeText}
            onBlur={() => setBoth(attended)}
            maxLength={4}
          />
          <Text style={styles.stepBtn} onPress={() => setBoth(attended + 1)}>
            +
          </Text>
        </View>
      </View>

      {shortfall > 0 ? (
        <View style={styles.shortfall}>
          <Text style={styles.shortfallText}>
            {t('shortfallNotice', '{{n}} did not attend — refund available on visitor request.', {
              n: shortfall,
            })}
          </Text>
        </View>
      ) : null}

      <Button
        label={
          checkIn.isPending
            ? t('loading', 'Loading…')
            : offline
            ? t('queueCheckIn', 'Queue check-in')
            : t('confirmCheckIn', 'Confirm check-in')
        }
        onPress={handleConfirm}
        loading={checkIn.isPending}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: typography.sizes.md, fontWeight: '700', color: colors.text, marginBottom: spacing.sm },
  booked: { fontSize: typography.sizes.sm, color: colors.textMuted, marginBottom: spacing.md },
  bookedValue: { color: colors.text, fontWeight: '700' },
  offlineNote: {
    backgroundColor: '#FEF3C7',
    padding: spacing.sm,
    borderRadius: radius.md,
    marginBottom: spacing.md,
  },
  offlineNoteText: { color: '#92400E', fontSize: typography.sizes.xs, lineHeight: 16 },
  stepperRow: { alignItems: 'center', marginBottom: spacing.md },
  stepper: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: radius.md },
  stepBtn: { width: 44, height: 44, textAlign: 'center', lineHeight: 44, fontSize: 24, fontWeight: '700', color: colors.brandPrimary },
  input: { minWidth: 56, paddingHorizontal: spacing.md, textAlign: 'center', fontSize: typography.sizes.lg, fontWeight: '700', color: colors.text },
  shortfall: { backgroundColor: '#FEF3C7', padding: spacing.md, borderRadius: radius.md, marginBottom: spacing.md },
  shortfallText: { color: '#92400E', fontSize: typography.sizes.sm, lineHeight: 20 },
});
