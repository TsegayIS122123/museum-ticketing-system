'use client';

import { useParams } from 'next/navigation';
import en from './locales/en/common.json';
import am from './locales/am/common.json';

const translations = { en, am } as const;
type TranslationKey = keyof typeof en;

export function useTranslation() {
  const params = useParams();
  const locale = (params?.lang as 'en' | 'am') || 'en';

  const t = (key: TranslationKey): string => {
    return translations[locale]?.[key] ?? translations.en[key] ?? key;
  };

  return { t, locale };
}
