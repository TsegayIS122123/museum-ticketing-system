import type { Metadata } from 'next';
import { ReactNode } from 'react';
import { SiteFooter } from '@/components/layout/SiteFooter';
import { AuthProvider } from '@/lib/auth/auth-context';
import { SITE_URL } from '@/lib/site';
import { AmbientBackground, GroundScene } from '@/components/ui/Backdrop';
import '../globals.css';

// The browser tab title carries the museum's own wordmark only. Addis
// Ababa University owns the museum, but is deliberately not part of the
// brand name (UAT round 1) -- the affiliation is credited once on the
// landing page instead, so it never reads as a compound institution name
// here, in `museum_name`, or in `landing_title`.
const COPY = {
  en: {
    title: 'Zoological Natural History Museum - Ticketing & Booking',
    description:
      "Book your visit to the Zoological Natural History Museum: Ethiopia's indigenous wildlife, preserved in a research collection built by AAU zoologists.",
    locale: 'en_US',
  },
  am: {
    title: 'የእንስሳት የተፈጥሮ ቅርስ መዘክር - የትኬት እና ቦታ ማስያዣ',
    description:
      'የኢትዮጵያን ብርቅዬ የዱር እንስሳት በአዲስ አበባ ዩኒቨርሲቲ የእንስሳት ተመራማሪዎች በተገነባ የምርምር ስብስብ ውስጥ ለማየት ጉብኝትዎን ያስይዙ።',
    locale: 'am_ET',
  },
} as const;

// Per-locale metadata (Phase 8 SEO): title/description in the page's own
// language, absolute Open Graph image, and hreflang alternates. The
// affiliation with AAU stays a credit line on the landing page, not part
// of the brand name here (UAT round 1).
export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang: rawLang } = await params;
  const lang = rawLang === 'am' ? 'am' : 'en';
  const copy = COPY[lang];
  return {
    metadataBase: new URL(SITE_URL),
    title: copy.title,
    description: copy.description,
    alternates: {
      canonical: `/${lang}`,
      languages: { en: '/en', am: '/am' },
    },
    openGraph: {
      type: 'website',
      siteName: COPY.en.title.split(' - ')[0],
      title: copy.title,
      description: copy.description,
      locale: copy.locale,
      url: `/${lang}`,
      images: [{ url: '/gallery/walia-ibex.jpg', width: 1280, height: 1004, alt: lang === 'am' ? 'ዋልያ' : 'Walia Ibex' }],
    },
    twitter: { card: 'summary_large_image', title: copy.title, description: copy.description, images: ['/gallery/walia-ibex.jpg'] },
  };
}

export async function generateStaticParams() {
  return [{ lang: 'en' }, { lang: 'am' }];
}

// This is the app's actual root layout (there is no non-dynamic
// app/layout.tsx above it) specifically so `lang` can be set on `<html>`
// from the route param below. Every page in this app lives under
// `[lang]`, so nothing is lost by rendering `<html>`/`<body>` here instead
// of a level up. Previously the outer layout hardcoded `lang="en"`, which
// meant `html[lang="am"]` CSS selectors — including the Amharic type-scale
// override in globals.css — could never match on `/am/*` routes, and
// screen readers announced Amharic pages as English. Rendering it from
// the resolved `lang` param fixes both.
export default async function LangLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ lang: string }>;
}) {
  const { lang: rawLang } = await params;
  const lang = rawLang === 'am' ? 'am' : 'en';

  return (
    <html lang={lang}>
      <body className="antialiased min-h-screen flex flex-col bg-sky-50/40">
        <AuthProvider>
          <AmbientBackground />
          <div className="relative z-10 flex min-h-screen flex-col">
            <div className="flex-1">{children}</div>
            <GroundScene />
            <SiteFooter locale={lang} />
          </div>
        </AuthProvider>
      </body>
    </html>
  );
}