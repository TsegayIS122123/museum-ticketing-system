import { Modal, Text, View, StyleSheet, Button } from 'react-native';
import type { FC } from 'react';

interface RescheduleModalProps {
  visible: boolean;
  bookingId: string;
  currentVisitDate: string;
  onClose: () => void;
  onSuccess: () => void;
}

const RescheduleModal: FC<RescheduleModalProps> = ({ visible, bookingId, currentVisitDate, onClose, onSuccess }) => {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>Reschedule</Text>
          <Text style={styles.description}>Reschedule booking {bookingId}</Text>
          <View style={styles.actions}>
            <Button title="Cancel" onPress={onClose} />
            <Button title="Reschedule" onPress={() => { onSuccess(); onClose(); }} />
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 20, width: '85%' },
  title: { fontSize: 18, fontWeight: '700', marginBottom: 8 },
  description: { fontSize: 14, color: '#666', marginBottom: 20 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12 },
});

export { RescheduleModal };
export default RescheduleModal;
