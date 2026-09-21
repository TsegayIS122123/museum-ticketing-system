import type { Metadata } from 'next';
import { ReactNode } from 'react';
import { SiteFooter } from '@/components/layout/SiteFooter';
import { AuthProvider } from '@/lib/auth/auth-context';
import '../globals.css';

// The browser tab title carries the museum's own wordmark only. Addis
// Ababa University owns the museum, but is deliberately not part of the
// brand name (UAT round 1) -- the affiliation is credited once on the
// landing page instead, so it never reads as a compound institution name
// here, in `museum_name`, or in `landing_title`.
export const metadata: Metadata = {
  title: 'Zoological Natural History Museum - Ticketing & Booking',
  description: 'Book and manage your museum visit online.',
};

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
      <body className="antialiased min-h-screen flex flex-col bg-stone-50">
        <AuthProvider>
          <div className="flex min-h-screen flex-col">
            <div className="flex-1">{children}</div>
            <SiteFooter locale={lang} />
          </div>
        </AuthProvider>
      </body>
    </html>
  );
}