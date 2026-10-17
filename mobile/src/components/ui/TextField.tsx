import { StyleSheet, TextInput, TextInputProps, View } from 'react-native';
import { AppText as Text } from '@/components/ui/AppText';
import { useTranslation } from 'react-i18next';
import { colors, spacing, typography } from '@/theme';

interface TextFieldProps extends TextInputProps {
  label?: string;
  error?: string;
}

export function TextField({ label, error, style, ...props }: TextFieldProps) {
  const { i18n } = useTranslation();
  const isAm = i18n.language === 'am';
  return (
    <View style={styles.wrap}>
      {label && <Text style={styles.label}>{label}</Text>}
      <TextInput
        style={[styles.input, isAm && styles.ethiopic, !!error && styles.inputError, style]}
        placeholderTextColor={colors.textMuted}
        {...props}
      />
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  label: { fontSize: 14, fontWeight: '500', color: colors.text },
  input: {
    minHeight: 48,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  inputError: { borderColor: colors.danger },
  error: { fontSize: 12, color: colors.danger },
  ethiopic: { fontFamily: typography.fontFamily.ethiopic },
});
