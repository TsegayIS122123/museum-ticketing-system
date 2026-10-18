import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, TextInputProps, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText as Text } from '@/components/ui/AppText';
import { useTranslation } from 'react-i18next';
import { colors, spacing, typography } from '@/theme';

interface TextFieldProps extends TextInputProps {
  label?: string;
  error?: string;
}

// The single text input for the whole app. When it is rendered as a password
// field (`secureTextEntry`), it also grows the reveal toggle: an eye / eye-off
// button pinned to the right edge that flips the value between hidden and
// readable. Every password input goes through here rather than a bare
// TextInput, so the toggle (and the Ethiopic font handling) is consistent.
export function TextField({ label, error, style, secureTextEntry, ...props }: TextFieldProps) {
  const { t, i18n } = useTranslation();
  const isAm = i18n.language === 'am';
  const isPassword = !!secureTextEntry;
  const [isRevealed, setIsRevealed] = useState(false);

  return (
    <View style={styles.wrap}>
      {label && <Text style={styles.label}>{label}</Text>}
      <View>
        <TextInput
          style={[
            styles.input,
            isAm && styles.ethiopic,
            isPassword && styles.inputWithToggle,
            !!error && styles.inputError,
            style,
          ]}
          placeholderTextColor={colors.textMuted}
          secureTextEntry={isPassword ? !isRevealed : false}
          {...props}
        />
        {isPassword && (
          <Pressable
            onPress={() => setIsRevealed((revealed) => !revealed)}
            accessibilityRole="button"
            accessibilityLabel={
              isRevealed
                ? t('hide_password', 'Hide password')
                : t('show_password', 'Show password')
            }
            hitSlop={8}
            style={styles.toggle}
          >
            <Ionicons
              name={isRevealed ? 'eye-off-outline' : 'eye-outline'}
              size={20}
              color={colors.textMuted}
            />
          </Pressable>
        )}
      </View>
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
  // Room for the reveal button so long passwords never slide under it.
  inputWithToggle: { paddingRight: 44 },
  inputError: { borderColor: colors.danger },
  toggle: {
    position: 'absolute',
    right: 4,
    top: 0,
    bottom: 0,
    width: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  error: { fontSize: 12, color: colors.danger },
  ethiopic: { fontFamily: typography.fontFamily.ethiopic },
});
