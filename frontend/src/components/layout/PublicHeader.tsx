'use client';

import { LanguageToggle } from '@/components/ui/LanguageToggle';
import { useTranslation } from '@/lib/i18n/useTranslation';
import Image from 'next/image';
import Link from 'next/link';

export function PublicHeader() {
  const { t, locale } = useTranslation();

  return (
    <header className="border-b bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <Link href={`/${locale}`} className="flex items-center gap-3">
          <Image
            src="/aau-logo.png"
            alt="Addis Ababa University"
            width={40}
            height={40}
            className="rounded-full"
            priority
          />
          <h1 className="text-xl font-bold text-stone-900 font-serif">
            {t('museum_name')}
          </h1>
        </Link>
        <div className="flex items-center gap-4">
          
          <LanguageToggle />
        </div>
      </div>
    </header>
  );
}
