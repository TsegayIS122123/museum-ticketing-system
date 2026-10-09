import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import { colors, spacing } from '@/theme';

type Variant = 'primary' | 'secondary' | 'danger';

interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
}: ButtonProps) {
  const isDisabled = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={[styles.base, styles[variant], isDisabled && styles.disabled]}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'secondary' ? colors.brandPrimary : colors.textInverse} />
      ) : (
        <Text style={[styles.label, variant === 'secondary' && styles.labelSecondary]}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 48,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  primary: { backgroundColor: colors.brandPrimary },
  secondary: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.brandPrimary },
  danger: { backgroundColor: colors.danger },
  disabled: { opacity: 0.5 },
  label: { color: colors.textInverse, fontSize: 16, fontWeight: '600' },
  labelSecondary: { color: colors.brandPrimary },
});
