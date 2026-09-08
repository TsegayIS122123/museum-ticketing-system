import Image from 'next/image';
import Link from 'next/link';
import { PublicHeader } from '@/components/layout/PublicHeader';
import { SpecimenGallery } from '@/components/ui/SpecimenGallery';
import { specimens } from '@/lib/gallery/specimens';
import en from '@/lib/i18n/locales/en/common.json';
import am from '@/lib/i18n/locales/am/common.json';

const dictionary = { en, am };

interface LandingPageProps {
  params: Promise<{ lang: 'en' | 'am' }>;
}

export default async function LandingPage({ params }: LandingPageProps) {
  const { lang } = await params;
  const t = dictionary[lang] || dictionary.en;
  const heroSpecimen = specimens[0];

  return (
    <div className="min-h-screen flex flex-col" data-surface="visitor">
      <PublicHeader />

      {/* Hero Section -- full-bleed so the dot-grid backdrop reads as a
          deliberate section, not another card floating in the page
          container. Text stays left-aligned and leads on mobile; the
          specimen photo drops below it instead of competing for the
          same viewport width. This is also the one place the museum's
          actual pitch lives -- the only collection of its kind in the
          country -- rather than the generic "innovation center" framing
          it used to carry. */}
      <section className="visitor-dot-grid border-b border-stone-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 lg:py-20 grid lg:grid-cols-2 gap-10 items-center">
          <div className="text-center lg:text-left">
            <p className="text-sm font-semibold uppercase tracking-wide text-primary-600">
              {t.landing_eyebrow}
            </p>
            <h2 className="mt-2 text-4xl text-stone-900 sm:text-5xl font-bold tracking-tight">
              {t.landing_title}
            </h2>
            <p className="mt-4 text-lg text-stone-600 max-w-2xl mx-auto lg:mx-0">
              {t.landing_subtitle}
            </p>
            {/* Individuals booking their own tickets are the overwhelming
                majority of visitors here, so the primary CTA takes them
                straight into that flow with no interstitial choice to
                make first. Group/school visits are a real but much rarer
                path -- someone planning one is already looking for that
                option, not stumbling onto it -- so it gets a quieter,
                secondary link underneath instead of competing equally
                inside the same button. */}
            <div className="mt-8 flex flex-col items-center gap-3 lg:items-start">
              <Link
                href={`/${lang}/book`}
                className="inline-flex items-center gap-2 rounded-lg bg-brand-primary px-6 py-3 text-sm font-medium text-white transition-all hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-brand-primary focus:ring-offset-1"
              >
                {t.book_now}
              </Link>
              <Link
                href={`/${lang}/group-visits/new`}
                className="text-sm font-medium text-stone-600 underline decoration-stone-300 underline-offset-4 transition-colors hover:text-brand-primary hover:decoration-brand-primary"
              >
                {t.book_group_visit_link}
              </Link>
            </div>
          </div>
          {/* Real specimen photography stands in for the old illustrated
              motif. Hidden below `lg` rather than shrunk, since a large
              photo below the fold on a phone competes with the actual
              booking CTA for attention. */}
          {heroSpecimen && (
            <div className="hidden lg:block w-full max-w-md mx-auto overflow-hidden rounded-2xl border border-stone-200 shadow-lg">
              <div className="relative aspect-[4/3] w-full bg-stone-100">
                <Image
                  src={heroSpecimen.src}
                  alt={lang === 'en' ? heroSpecimen.nameEn : heroSpecimen.nameAm}
                  fill
                  className="object-cover"
                  sizes="(min-width: 1024px) 28rem, 0px"
                  priority
                />
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Specimen gallery -- a sliding sample of what's on display,
          taking the place of the old categories/opening-hours section.
          Only the Walia Ibex has been photographed so far (see
          lib/gallery/specimens.ts), so it repeats for now. */}
      <section className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-12">
        <h3 className="text-2xl text-stone-900 mb-6 font-bold">
          {t.gallery_heading}
        </h3>
        <SpecimenGallery specimens={specimens} lang={lang} />
      </section>
    </div>
  );
}
