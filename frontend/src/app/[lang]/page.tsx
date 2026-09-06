import { Button } from '@/components/ui/Button';
import { PublicHeader } from '@/components/layout/PublicHeader';
import { OrbitMotif } from '@/components/ui/OrbitMotif';
import Link from 'next/link';
import en from '@/lib/i18n/locales/en/common.json';
import am from '@/lib/i18n/locales/am/common.json';

const dictionary = { en, am };

interface LandingPageProps {
  params: Promise<{ lang: 'en' | 'am' }>;
}

export default async function LandingPage({ params }: LandingPageProps) {
  const { lang } = await params;
  const t = dictionary[lang] || dictionary.en;

  return (
    <div className="min-h-screen flex flex-col" data-surface="visitor">
      <PublicHeader />

      {/* Hero Section -- full-bleed so the dot-grid backdrop and orbit
          motif read as a deliberate section, not another card floating
          in the page container. Text stays left-aligned and leads on
          mobile; the motif drops below it instead of competing for the
          same viewport width. */}
      <section className="visitor-dot-grid border-b border-stone-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 lg:py-20 grid lg:grid-cols-2 gap-10 items-center">
          <div className="text-center lg:text-left">
            <h2 className="text-4xl text-stone-900 sm:text-5xl font-bold tracking-tight">
              {t.landing_title}
            </h2>
            <p className="mt-4 text-lg text-stone-600 max-w-2xl mx-auto lg:mx-0">
              {t.landing_subtitle}
            </p>
            <div className="mt-8 flex flex-wrap justify-center lg:justify-start gap-4">
              <Link href={`/${lang}/book`}>
                <Button size="lg" className="bg-brand-primary hover:bg-primary-700">
                  {t.book_now}
                </Button>
              </Link>
            </div>
          </div>
          {/* Illustrated stand-in for exhibit photography -- see
              OrbitMotif's own comment. Hidden below `lg` rather than
              shrunk, since a small decorative graphic below the fold on
              a phone competes with the actual booking CTA for attention. */}
          <OrbitMotif className="hidden lg:block w-full max-w-md mx-auto" />
        </div>
      </section>
    </div>
  );
}
