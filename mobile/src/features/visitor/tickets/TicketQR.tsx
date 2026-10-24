import { View, StyleSheet } from 'react-native';
import { AppText as Text } from '@/components/ui/AppText';
import { colors, spacing, typography } from '@/theme';
import type { FC } from 'react';

interface TicketQRProps {
  reference: string;
  size?: number;
}

const TicketQR: FC<TicketQRProps> = ({ reference, size = 240 }) => {
  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
      <Text style={styles.placeholder}>QR: {reference}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { backgroundColor: '#fff', borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  placeholder: { color: colors.textMuted, fontSize: typography.sizes.xs },
});

export { TicketQR };
export default TicketQR;
