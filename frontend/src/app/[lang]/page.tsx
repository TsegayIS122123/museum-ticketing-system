import { LanguageToggle } from '@/components/ui/LanguageToggle';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { getCategories } from '@/features/catalog/api';
import { useTranslation } from '@/lib/i18n/useTranslation';
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
  
  let categories = [];
  let error = null;
  
  try {
    categories = await getCategories();
  } catch (err) {
    error = 'Failed to load categories. Please try again later.';
  }

  return (
    <div className="min-h-screen flex flex-col" data-surface="visitor">
      {/* Header */}
      <header className="border-b bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <h1 className="text-xl font-bold text-stone-900 font-serif">
            {t.museum_name}
          </h1>
          <LanguageToggle />
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Hero Section */}
        <section className="text-center py-12">
          <h2 className="text-4xl font-extrabold text-stone-900 sm:text-5xl font-serif">
            {t.landing_title}
          </h2>
          <p className="mt-4 text-lg text-stone-600 max-w-2xl mx-auto">
            {t.landing_subtitle}
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-4">
            <Link href={`/${lang}/book`}>
              <Button size="lg" className="bg-amber-600 hover:bg-amber-700">
                {t.book_now}
              </Button>
            </Link>
            <Link href={`/${lang}/verify`}>
              <Button size="lg" variant="secondary">
                {t.verify_visitor}
              </Button>
            </Link>
          </div>
        </section>

        {/* Categories Section */}
        <section className="mt-12">
          <h3 className="text-2xl font-bold text-stone-900 mb-6 font-serif">
            {t.browse_tickets}
          </h3>
          
          {error ? (
            <ErrorBanner message={error} />
          ) : categories.length === 0 ? (
            <div className="text-center py-12 text-stone-500">
              No categories available.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
              {categories.map((category) => (
                <Card key={category.id} className="hover:shadow-md transition-shadow">
                  <div className="flex flex-col h-full">
                    <div className="flex-1">
                      <h4 className="text-lg font-semibold text-stone-900">
                        {lang === 'en' ? category.nameEn : category.nameAm}
                      </h4>
                      <p className="text-sm text-stone-500 mt-1">
                        {lang === 'en' ? category.nameAm : category.nameEn}
                      </p>
                      <p className="text-xs text-stone-400 mt-2">
                        {lang === 'en' ? category.descriptionEn : category.descriptionAm}
                      </p>
                    </div>
                    <div className="mt-4 pt-4 border-t border-stone-100">
                      <p className="text-2xl font-bold text-amber-600 font-serif">
                        {category.isFree ? 'FREE' : `ETB ${category.priceEtb}`}
                      </p>
                      <Link href={`/${lang}/book`}>
                        <Button className="w-full mt-3 bg-amber-600 hover:bg-amber-700">
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
        <section className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card>
            <div className="text-2xl mb-3">🕐</div>
            <h4 className="font-semibold text-stone-900 text-sm">Opening Hours</h4>
            <p className="text-sm text-stone-600">Tue–Sun 9:00 AM – 5:00 PM</p>
            <p className="text-xs text-stone-400">Closed Mondays & Public Holidays</p>
          </Card>
          <Card>
            <div className="text-2xl mb-3">📍</div>
            <h4 className="font-semibold text-stone-900 text-sm">Location</h4>
            <p className="text-sm text-stone-600">AAU CNCS, 4 Killo</p>
            <p className="text-xs text-stone-400">Addis Ababa, Ethiopia</p>
          </Card>
          <Card>
            <div className="text-2xl mb-3">📞</div>
            <h4 className="font-semibold text-stone-900 text-sm">Enquiries</h4>
            <p className="text-sm text-stone-600">+251-900-000-000</p>
            <p className="text-xs text-stone-400">info@sciencemuseum.et</p>
          </Card>
        </section>
      </main>
    </div>
  );
}
