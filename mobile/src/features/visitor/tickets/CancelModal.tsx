import { Alert, Modal, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { colors, spacing, typography } from '@/theme';
import { useCancelBooking } from '@/api/queries/bookings';
import { isApiError } from '@/api/errors';

interface CancelModalProps {
  visible: boolean;
  bookingId: string;
  onClose: () => void;
  onSuccess?: () => void;
}

export function CancelModal({ visible, bookingId, onClose, onSuccess }: CancelModalProps) {
  const { t } = useTranslation();
  const cancel = useCancelBooking();

  const handleConfirm = async () => {
    try {
      await cancel.mutateAsync(bookingId);
      onClose();
      onSuccess?.();
    } catch (err) {
      const msg = isApiError(err) ? err.message : t('commonErrorGeneric', 'Something went wrong');
      Alert.alert(t('cancelFailed', 'Cancellation failed'), msg);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Card style={styles.dialog}>
          <Text style={styles.title}>{t('cancelBookingTitle', 'Cancel this booking?')}</Text>
          <Text style={styles.body}>
            {t(
              'cancelBookingBody',
              'A full refund will be issued automatically. You cannot undo this.'
            )}
          </Text>
          <View style={styles.actions}>
            <View style={{ flex: 1 }}>
              <Button label={t('back', 'Keep booking')} variant="secondary" onPress={onClose} />
            </View>
            <View style={{ flex: 1 }}>
              <Button
                label={t('cancelConfirm', 'Cancel booking')}
                variant="danger"
                onPress={handleConfirm}
                loading={cancel.isPending}
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
  dialog: { width: '100%', maxWidth: 420 },
  title: { fontSize: typography.sizes.lg, fontWeight: '700', color: colors.text, marginBottom: spacing.sm },
  body: { fontSize: typography.sizes.sm, color: colors.textMuted, marginBottom: spacing.lg, lineHeight: 20 },
  actions: { flexDirection: 'row', gap: spacing.md },
});
