import { Platform } from 'react-native';

const latinStack = Platform.select({
  ios: 'System',
  android: 'Roboto',
  default: 'System',
});

const ethiopicStack = Platform.select({
  ios: 'System',
  android: 'NotoSansEthiopic',
  default: 'System',
});

export const typography = {
  sizes: {
    xs: 12,
    sm: 14,
    md: 16,
    lg: 18,
    xl: 22,
    xxl: 28,
    xxxl: 34,
    hero: 40,
  },
  weights: {
    regular: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
  },
  lineHeight: {
    tight: 1.2,
    normal: 1.5,
    relaxed: 1.7,
  },
  fontFamily: {
    latin: latinStack,
    ethiopic: ethiopicStack,
  },
} as const;

/** Utility: return the right font family for the active locale. */
export function fontForLocale(locale: 'en' | 'am'): string {
  return locale === 'am'
    ? typography.fontFamily.ethiopic
    : typography.fontFamily.latin;
}