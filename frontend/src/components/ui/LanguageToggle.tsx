'use client';

import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils/cn';

export function LanguageToggle() {
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
    <div className="inline-flex rounded-lg shadow-sm border border-stone-200 bg-white p-0.5">
      {(['en', 'am'] as const).map((lang) => (
        <button
          key={lang}
          type="button"
          onClick={() => switchLanguage(lang)}
          className={cn(
            'px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
            currentLang === lang
              ? 'bg-brand-primary text-white'
              : 'text-stone-700 hover:text-stone-900 hover:bg-stone-50'
          )}
          aria-label={lang === 'en' ? 'Switch to English' : 'Switch to Amharic'}
        >
          {lang === 'en' ? 'English' : 'አማርኛ'}
        </button>
      ))}
    </div>
  );
}
