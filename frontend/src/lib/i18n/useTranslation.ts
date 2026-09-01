'use client';

import { useParams } from 'next/navigation';
import en from './locales/en/common.json';
import am from './locales/am/common.json';

const translations = { en, am } as const;
type TranslationKey = keyof typeof en;

export function useTranslation() {
  const params = useParams();
  const locale = (params?.lang as 'en' | 'am') || 'en';

  // Every call site in the app follows `t('some_key') || 'English
  // fallback'` -- the translation JSON files are intentionally a work in
  // progress (37 keys today against ~190 call sites), with the fallback
  // supplying the real copy for anything not yet translated. Typing the
  // parameter as the strict `TranslationKey` union made every one of
  // those not-yet-translated keys a type error (~150 of them) even
  // though the runtime behavior was always correct. `TranslationKey |
  // (string & {})` keeps autocomplete/type-checking for keys that DO
  // exist in en.json while still accepting any string, matching how t()
  // is actually used everywhere.
  const t = (key: TranslationKey | (string & {})): string => {
    const enTranslations: Record<string, string> = translations.en;
    const localeTranslations: Record<string, string> = translations[locale] ?? enTranslations;
    return localeTranslations[key] ?? enTranslations[key] ?? key;
  };

  return { t, locale };
}
