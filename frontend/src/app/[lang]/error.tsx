'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { Button } from '@/components/ui/Button';

/** Route-level error boundary (Phase 8). Shows a friendly, translated
 *  message; the raw error never reaches the visitor, it is only logged so
 *  the error tracker (Sentry, when configured) can pick it up. */
export default function LangError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { t, locale } = useTranslation();
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main role="alert" className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center px-4 text-center">
      <h1 className="font-serif text-3xl font-semibold text-stone-900">{t('error_title')}</h1>
      <p className="mt-3 text-stone-600">{t('error_body')}</p>
      {error.digest && <p className="mt-2 text-xs text-stone-500">{t('error_reference', { id: error.digest })}</p>}
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Button onClick={reset}>{t('try_again')}</Button>
        <Link href={`/${locale}`} className="inline-flex min-h-[44px] items-center rounded-lg border border-stone-300 px-4 text-sm font-medium text-stone-800 hover:border-brand-primary">
          {t('back_to_home')}
        </Link>
      </div>
    </main>
  );
}
