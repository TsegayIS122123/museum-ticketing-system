import { Modal, Text, View, StyleSheet, Button } from 'react-native';
import type { FC } from 'react';

interface CancelModalProps {
  visible: boolean;
  bookingId: string;
  onClose: () => void;
  onSuccess: () => void;
}

const CancelModal: FC<CancelModalProps> = ({ visible, bookingId, onClose, onSuccess }) => {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>Cancel booking?</Text>
          <Text style={styles.description}>This action cannot be undone.</Text>
          <View style={styles.actions}>
            <Button title="Keep booking" onPress={onClose} />
            <Button title="Cancel booking" onPress={() => { onSuccess(); onClose(); }} color="#B91C1C" />
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

export { CancelModal };
export default CancelModal;
