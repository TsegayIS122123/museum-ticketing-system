import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { colors, radius, spacing, typography } from '@/theme';

interface TicketQRProps {
  /** The bare 8-character booking reference — never a signed payload. */
  reference: string;
  size?: number;
}

/**
 * The visitor's ticket QR code.
 *
 * Payload is the bare booking reference (e.g. "K7M2QP4A"), not a signed
 * token. The gate lookup treats it as a lookup key, not an authenticator
 * (ADR-007). This is the first real QR in the product.
 *
 * Note on brightness: `expo-brightness` could be used to force max
 * brightness while this screen is focused, but it requires an additional
 * native module. Left as a future improvement — the white background and
 * generous size give the scanner enough contrast on most phones today.
 */
export function TicketQR({ reference, size = 260 }: TicketQRProps) {
  return (
    <View style={styles.wrap}>
      <View style={[styles.qrFrame, { width: size + spacing.lg * 2 }]}>
        <QRCode
          value={reference}
          size={size}
          color="#000000"
          backgroundColor="#FFFFFF"
          ecl="M"
        />
      </View>
      <Text style={styles.reference}>{reference}</Text>
      <Text style={styles.hint}>Present this at the gate</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: spacing.md },
  qrFrame: {
    padding: spacing.lg,
    backgroundColor: '#FFFFFF',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reference: {
    fontSize: typography.sizes.lg,
    fontWeight: '700',
    letterSpacing: 4,
    color: colors.text,
    fontFamily: typography.fontFamily.latin,
  },
  hint: { fontSize: typography.sizes.xs, color: colors.textMuted },
});
