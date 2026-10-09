import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { addDays, format, isSameDay, startOfDay } from 'date-fns';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { colors, radius, spacing, typography } from '@/theme';
import { useAvailability, useRescheduleBooking } from '@/api/queries/bookings';
import { toIsoDate } from '@/utils/dates';
import { isApiError } from '@/api/errors';

interface RescheduleModalProps {
  visible: boolean;
  bookingId: string;
  currentVisitDate: string;
  onClose: () => void;
  onSuccess?: () => void;
}

export function RescheduleModal({
  visible,
  bookingId,
  onClose,
  onSuccess,
}: RescheduleModalProps) {
  const { t } = useTranslation();
  const [newDate, setNewDate] = useState('');
  const today = useMemo(() => startOfDay(new Date()), []);
  const horizon = 60;

  const dates = useMemo(
    () => Array.from({ length: horizon }, (_, i) => addDays(today, i)),
    [today]
  );
  const fromIso = toIsoDate(today);
  const toIso = toIsoDate(addDays(today, horizon - 1));
  const { data: rows, isLoading } = useAvailability(fromIso, toIso, visible);
  const reschedule = useRescheduleBooking();

  useEffect(() => {
    if (!visible) setNewDate('');
  }, [visible]);

  const closed = useMemo(() => {
    const s = new Set<string>();
    (rows ?? []).forEach((r) => {
      if (!r.is_open_for_booking) s.add(r.date);
    });
    return s;
  }, [rows]);

  const isOpen = (d: Date) => {
    const iso = toIsoDate(d);
    if (closed.has(iso)) return false;
    if (d.getDay() === 0) return false;
    return true;
  };

  const handleConfirm = async () => {
    if (!newDate) return;
    try {
      await reschedule.mutateAsync({ id: bookingId, newVisitDate: newDate });
      onClose();
      onSuccess?.();
    } catch (err) {
      const msg = isApiError(err) ? err.message : t('commonErrorGeneric', 'Something went wrong');
      Alert.alert(t('rescheduleFailed', 'Reschedule failed'), msg);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Card style={styles.dialog}>
          <Text style={styles.title}>{t('rescheduleTitle', 'Reschedule booking')}</Text>
          <Text style={styles.body}>
            {t('rescheduleBody', 'You can reschedule a booking only once.')}
          </Text>

          {isLoading ? (
            <ActivityIndicator color={colors.brandPrimary} />
          ) : (
            <ScrollView style={styles.gridScroll} contentContainerStyle={styles.grid}>
              {dates.map((d) => {
                const iso = toIsoDate(d);
                const open = isOpen(d);
                const selected = newDate ? isSameDay(d, new Date(newDate)) : false;
                return (
                  <Pressable
                    key={iso}
                    disabled={!open}
                    onPress={() => setNewDate(iso)}
                    style={[
                      styles.cell,
                      !open && styles.cellClosed,
                      selected && styles.cellSelected,
                    ]}
                  >
                    <Text style={[styles.day, !open && styles.dayClosed]}>{format(d, 'd')}</Text>
                    <Text style={[styles.month, !open && styles.dayClosed]}>
                      {format(d, 'MMM')}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}

          <View style={styles.actions}>
            <View style={{ flex: 1 }}>
              <Button label={t('back', 'Back')} variant="secondary" onPress={onClose} />
            </View>
            <View style={{ flex: 1 }}>
              <Button
                label={t('continue', 'Confirm')}
                onPress={handleConfirm}
                loading={reschedule.isPending}
                disabled={!newDate}
              />
            </View>
          </View>
        </Card>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  dialog: { width: '100%', maxWidth: 460 },
  title: { fontSize: typography.sizes.lg, fontWeight: '700', color: colors.text, marginBottom: spacing.sm },
  body: { fontSize: typography.sizes.sm, color: colors.textMuted, marginBottom: spacing.md },
  gridScroll: { maxHeight: 260 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, paddingVertical: spacing.sm },
  cell: { width: 52, height: 60, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  cellClosed: { backgroundColor: colors.surfaceAlt, opacity: 0.5 },
  cellSelected: { borderColor: colors.brandPrimary, backgroundColor: colors.brandPrimaryLight },
  day: { fontSize: typography.sizes.md, fontWeight: '700', color: colors.text },
  dayClosed: { color: colors.textMuted },
  month: { fontSize: 10, color: colors.textMuted, textTransform: 'uppercase' },
  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
});
