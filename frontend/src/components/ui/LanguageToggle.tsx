'use client';

import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils/cn';
import { useTranslation } from '@/lib/i18n/useTranslation';

export function LanguageToggle() {
  const { t } = useTranslation();
  const pathname = usePathname();
  const router = useRouter();
  const currentLang = pathname.split('/')[1] || 'en';

  const switchLanguage = (newLang: 'en' | 'am') => {
    if (newLang === currentLang) return;
    const segments = pathname.split('/');
    segments[1] = newLang;
    router.push(segments.join('/'));
  };

  return (
    <div className="inline-flex rounded-full border border-brand-primary/15 bg-white/80 p-0.5 shadow-sm">
      {(['en', 'am'] as const).map((lang) => (
        <button
          key={lang}
          type="button"
          onClick={() => switchLanguage(lang)}
          className={cn(
            'rounded-full px-3.5 py-1.5 text-xs font-semibold leading-none transition-colors',
            currentLang === lang
              ? 'bg-brand-primary text-white shadow-sm'
              : 'text-brand-primary/80 hover:bg-brand-primary/10 hover:text-brand-primary'
          )}
          aria-label={lang === 'en' ? (t('switch_to_english') || 'Switch to English') : (t('switch_to_amharic') || 'Switch to Amharic')}
        >
          {lang === 'en' ? 'English' : 'አማርኛ'}
        </button>
      ))}
    </div>
  );
}
