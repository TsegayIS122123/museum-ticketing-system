'use client';

import { useParams } from 'next/navigation';
import en from './locales/en/common.json';
import am from './locales/am/common.json';

const translations = { en, am } as const;
type TranslationKey = keyof typeof en;

function humanizeKey(key: string): string {
  return key
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/^./, (character) => character.toUpperCase());
}

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
  // Optional `values` map fills in `{{placeholder}}` tokens inside the
  // translated string, e.g. t('greeting', { name: 'Abel' }) for a JSON
  // entry of "Hello, {{name}}!". Translations must never contain raw JS
  // template-literal syntax (`${...}`) -- that text is copied verbatim
  // since t() only does a plain lookup, it never evaluates expressions.
  const t = (
    key: TranslationKey | (string & {}),
    values?: Record<string, string | number>
  ): string => {
    const enTranslations: Record<string, string> = translations.en;
    const localeTranslations: Record<string, string> = translations[locale] ?? enTranslations;
    const raw = localeTranslations[key] ?? enTranslations[key] ?? humanizeKey(key);
    if (!values) return raw;
    return Object.entries(values).reduce(
      (result, [name, value]) => result.replaceAll(`{{${name}}}`, String(value)),
      raw
    );
  };

  return { t, locale };
}
