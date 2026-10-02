'use client';

import Link from 'next/link';
import { useTranslation } from '@/lib/i18n/useTranslation';

export default function LangNotFound() {
  const { t, locale } = useTranslation();
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center px-4 text-center">
      <p className="text-sm font-semibold text-brand-primary">404</p>
      <h1 className="mt-2 font-serif text-3xl font-semibold text-stone-900">{t('not_found_title')}</h1>
      <p className="mt-3 text-stone-600">{t('not_found_body')}</p>
      <Link href={`/${locale}`} className="mt-6 inline-flex min-h-[44px] items-center rounded-lg bg-brand-primary px-5 text-sm font-medium text-white">
        {t('back_to_home')}
      </Link>
    </main>
  );
}
