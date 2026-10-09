import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getLocales } from 'expo-localization';
import { I18nManager } from 'react-native';

import en from './locales/en/common.json';
import am from './locales/am/common.json';

const deviceLocale = getLocales()[0]?.languageCode ?? 'en';
const initialLocale = deviceLocale === 'am' ? 'am' : 'en';

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    am: { translation: am },
  },
  lng: initialLocale,
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  returnNull: false,
});

export default i18n;
export const SUPPORTED_LOCALES = ['en', 'am'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];
