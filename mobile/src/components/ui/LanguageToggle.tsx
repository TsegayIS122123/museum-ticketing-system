import { Pressable, StyleSheet, View } from 'react-native';
import { AppText as Text } from '@/components/ui/AppText';
import { useTranslation } from 'react-i18next';
import { colors, spacing } from '@/theme';
import { SUPPORTED_LOCALES, type SupportedLocale } from '@/i18n';

const LABELS: Record<SupportedLocale, string> = {
  en: 'English',
  am: 'አማርኛ',
};

export function LanguageToggle() {
  const { i18n } = useTranslation();
  const current = (i18n.language === 'am' ? 'am' : 'en') as SupportedLocale;

  const change = (locale: SupportedLocale) => {
    if (locale !== current) i18n.changeLanguage(locale);
  };

  return (
    <View style={styles.wrap}>
      {SUPPORTED_LOCALES.map((locale) => (
        <Pressable
          key={locale}
          onPress={() => change(locale)}
          style={[styles.btn, current === locale && styles.btnActive]}
        >
          <Text style={[styles.label, current === locale && styles.labelActive]}>
            {LABELS[locale]}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    overflow: 'hidden',
    alignSelf: 'flex-start',
  },
  btn: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  btnActive: { backgroundColor: colors.brandPrimary },
  label: { fontSize: 13, fontWeight: '500', color: colors.text },
  labelActive: { color: colors.textInverse },
});
