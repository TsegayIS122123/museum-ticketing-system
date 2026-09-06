import { Clock, MapPin, Phone, Ticket } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { PublicHeader } from '@/components/layout/PublicHeader';
import { OrbitMotif } from '@/components/ui/OrbitMotif';
import { getCategories } from '@/features/catalog/api';
import type { Category } from '@/features/catalog/schemas';
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
  
  let categories: Category[] = [];
  let error = null;
  
  try {
    categories = await getCategories();
  } catch (err) {
    error = t.categories_load_failed;
  }

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

      {/* Main Content */}
      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Categories Section */}
        <section>
          <h3 className="text-2xl text-stone-900 mb-6 font-bold">
            {t.browse_tickets}
          </h3>
          
          {error ? (
            <ErrorBanner message={error} />
          ) : categories.length === 0 ? (
            <div className="text-center py-12 text-stone-500">
              {t.no_categories_available}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
              {categories.map((category) => (
                <Card
                  key={category.id}
                  className="hover:shadow-md hover:-translate-y-0.5 transition-all border-t-4 border-t-primary-600"
                >
                  <div className="flex flex-col h-full">
                    <div className="flex-1">
                      <h4 className="text-lg font-semibold text-stone-900">
                        {lang === 'en' ? category.name_en : category.name_am}
                      </h4>
                      <p className="text-sm text-stone-500 mt-1">
                        {lang === 'en' ? category.name_am : category.name_en}
                      </p>
                    </div>
                    <div className="mt-4 pt-4 border-t border-dashed border-stone-200">
                      <p className="flex items-baseline gap-1.5 text-2xl text-amber-600 font-bold">
                        <Ticket className="w-4 h-4 shrink-0 self-center" aria-hidden="true" />
                        {`ETB ${category.price_etb}`}
                      </p>
                      <Link href={`/${lang}/book`}>
                        <Button className="w-full mt-3 bg-brand-primary hover:bg-primary-700">
                          {t.book_now}
                        </Button>
                      </Link>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </section>

        {/* Museum Info */}
        <section className="mt-16 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-12 bg-primary-50 rounded-none sm:rounded-2xl">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="flex flex-col items-center text-center md:items-start md:text-left">
              <div className="text-primary-600 mb-3"><Clock className="w-6 h-6" /></div>
              <h4 className="font-semibold text-stone-900 text-sm">{t.opening_hours}</h4>
              <p className="text-sm text-stone-600">{t.opening_hours_time}</p>
              <p className="text-xs text-stone-400">{t.opening_hours_closed}</p>
            </div>
            <div className="flex flex-col items-center text-center md:items-start md:text-left">
              <div className="text-primary-600 mb-3"><MapPin className="w-6 h-6" /></div>
              <h4 className="font-semibold text-stone-900 text-sm">{t.location}</h4>
              <p className="text-sm text-stone-600">{t.location_address_line1}</p>
              <p className="text-xs text-stone-400">{t.location_address_line2}</p>
            </div>
            <div className="flex flex-col items-center text-center md:items-start md:text-left">
              <div className="text-primary-600 mb-3"><Phone className="w-6 h-6" /></div>
              <h4 className="font-semibold text-stone-900 text-sm">{t.enquiries}</h4>
              <p className="text-sm text-stone-600">+251-900-000-000</p>
              <p className="text-xs text-stone-400">info@sciencemuseum.et</p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
