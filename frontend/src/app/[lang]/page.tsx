import Image from 'next/image';
import { CalendarDays, CreditCard, QrCode } from 'lucide-react';
import { PublicHeader } from '@/components/layout/PublicHeader';
import { BookVisitCTA } from '@/components/landing/BookVisitCTA';
import { SpecimenGallery } from '@/components/ui/SpecimenGallery';
import { SavannaScene, WaveDivider } from '@/components/ui/Backdrop';
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

  const steps = [
    { Icon: CalendarDays, title: t.how_step1_title, body: t.how_step1_body, chip: 'from-sky-400 to-primary-500', ring: 'ring-sky-300/60' },
    { Icon: CreditCard, title: t.how_step2_title, body: t.how_step2_body, chip: 'from-sun-400 to-sun-600', ring: 'ring-sun-300/70' },
    { Icon: QrCode, title: t.how_step3_title, body: t.how_step3_body, chip: 'from-leaf-400 to-leaf-600', ring: 'ring-leaf-300/70' },
  ];

  return (
    <div className="flex min-h-screen flex-col" data-surface="visitor">
      <PublicHeader />

      {/* Hero: a living savanna behind the pitch. The scene is decorative
          (aria-hidden); the copy and the booking CTA stay on top and the
          specimen photo gets coloured offset frames so it pops. */}
      <section className="relative isolate overflow-hidden bg-gradient-to-b from-[#b9e7ff] via-[#e4f6ff] to-[#fdf5e1]">
        <SavannaScene />
        <div className="relative z-10 mx-auto grid max-w-7xl items-center gap-12 px-4 pb-40 pt-14 sm:px-6 sm:pb-48 lg:grid-cols-2 lg:px-8 lg:pb-56 lg:pt-20">
          <div className="text-center lg:text-left">
            <p className="reveal inline-flex items-center gap-2 rounded-full bg-white/80 px-4 py-1.5 text-sm font-semibold uppercase tracking-wide text-primary-700 shadow-sm ring-1 ring-sun-300/70 backdrop-blur">
              <span className="h-2 w-2 animate-pulse rounded-full bg-sun-500" aria-hidden="true" />
              {t.landing_eyebrow}
            </p>
            <h1 className="reveal d1 mt-4 text-4xl font-extrabold tracking-tight text-stone-900 sm:text-5xl lg:text-6xl">
              <span className="text-gradient">{t.landing_title}</span>
            </h1>
            {/* AAU is a credit line, not part of the brand name (UAT round 1). */}
            <p className="reveal d2 mt-3 text-sm font-medium text-stone-700">{t.affiliation_line}</p>
            <p className="reveal d2 mx-auto mt-4 max-w-2xl text-lg text-stone-800 lg:mx-0">{t.landing_subtitle}</p>
            <div className="reveal d3 mt-8 flex flex-col items-center gap-3 lg:items-start">
              <BookVisitCTA
                lang={lang}
                labels={{
                  bookNow: t.book_now,
                  modalTitle: t.choose_visit_type,
                  schoolTitle: t.school_visit_title,
                  schoolDescription: t.school_visit_description,
                  personalTitle: t.personal_visit_title,
                  personalDescription: t.personal_visit_description,
                }}
              />
            </div>
          </div>

          {heroSpecimen && (
            <div className="reveal d3 hidden lg:block">
              <div className="photo-frame mx-auto w-full max-w-md">
                <div className="float-y slow">
                <div className="overflow-hidden rounded-3xl border-4 border-white shadow-2xl">
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
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* How it works: fills the space under the hero with the actual
          booking journey, three coloured steps. */}
      <section className="relative z-10 -mt-10 px-4 sm:px-6 lg:px-8">
        <div className="glass mx-auto max-w-6xl rounded-3xl p-6 sm:p-10">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-stone-900 sm:text-3xl">{t.how_title}</h2>
            <p className="mx-auto mt-2 max-w-xl text-stone-700">{t.how_subtitle}</p>
          </div>
          <ol className="mt-8 grid gap-6 md:grid-cols-3">
            {steps.map(({ Icon, title, body, chip, ring }, i) => (
              <li key={title} className="lift relative rounded-2xl bg-white/90 p-6 text-center shadow-sm ring-1 ring-stone-200">
                <span className={`absolute -top-3 left-1/2 flex h-7 w-7 -translate-x-1/2 items-center justify-center rounded-full bg-stone-900 text-xs font-bold text-white`}>{i + 1}</span>
                <span className={`mx-auto mt-2 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br ${chip} text-white shadow-lg ring-4 ${ring}`}>
                  <Icon className="h-8 w-8" aria-hidden="true" />
                </span>
                <h3 className="mt-4 text-lg font-semibold text-stone-900">{title}</h3>
                <p className="mt-1 text-sm text-stone-700">{body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Specimen gallery on a coloured band with wavy edges. */}
      <section className="relative mt-16">
        <WaveDivider className="text-sky-100/80" flip />
        <div className="bg-gradient-to-b from-sky-100/80 via-sun-300/20 to-leaf-300/25 pb-6">
          <div className="mx-auto w-full max-w-7xl px-4 pb-6 sm:px-6 lg:px-8">
            <h2 className="mb-8 flex items-center gap-3 text-2xl font-bold text-stone-900 sm:text-3xl">
              <span className="h-8 w-1.5 rounded-full bg-gradient-to-b from-sun-400 to-coral-400" aria-hidden="true" />
              {t.gallery_heading}
            </h2>
            <SpecimenGallery specimens={specimens} lang={lang} />
          </div>
        </div>
        <WaveDivider className="text-leaf-300/25" />
      </section>
    </div>
  );
}
