import { Text as RNText, StyleSheet, type TextProps } from 'react-native';
import { useTranslation } from 'react-i18next';

import { typography } from '@/theme';

/**
 * Locale-aware Text. React Native has no font inheritance, so when the active
 * language is Amharic this appends the bundled Ethiopic font family so every
 * label renders with a font that actually has Ethiopic glyphs. The explicit
 * font family wins over any Latin `fontFamily` set in the passed `style`.
 *
 * Import it under the `Text` name so JSX is unchanged:
 *
 *   import { AppText as Text } from '@/components/ui/AppText';
 */
export function AppText({ style, ...props }: TextProps) {
  const { i18n } = useTranslation();
  const isAm = i18n.language === 'am';
  return <RNText {...props} style={isAm ? [style, styles.ethiopic] : style} />;
}

const styles = StyleSheet.create({
  ethiopic: { fontFamily: typography.fontFamily.ethiopic },
});
