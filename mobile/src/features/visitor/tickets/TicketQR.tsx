import { View, StyleSheet } from 'react-native';
import { AppText as Text } from '@/components/ui/AppText';
import { colors, typography } from '@/theme';
import QRCode from 'react-native-qrcode-svg';
import type { FC } from 'react';

interface TicketQRProps {
  reference: string;
  size?: number;
}

const TicketQR: FC<TicketQRProps> = ({ reference, size = 240 }) => {
  return (
    <View style={styles.container}>
      <View style={[styles.wrap, { width: size, height: size }]}>
        <QRCode value={reference} size={size - 32} backgroundColor="#FFFFFF" color="#000000" />
      </View>
      <Text style={styles.reference}>{reference}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { alignItems: 'center', gap: 8 },
  wrap: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  reference: {
    color: colors.text,
    fontSize: typography.sizes.sm,
    fontWeight: '700',
    letterSpacing: 2,
  },
});

export { TicketQR };
export default TicketQR;
