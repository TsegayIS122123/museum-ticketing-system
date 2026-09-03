import type { Metadata } from 'next';
import { ReactNode } from 'react';
import { SiteFooter } from '@/components/layout/SiteFooter';

export const metadata: Metadata = {
  title: 'Science Museum - Ticketing & Booking',
  description: 'Book and manage your museum visit online.',
};

export async function generateStaticParams() {
  return [{ lang: 'en' }, { lang: 'am' }];
}

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
    <div className="flex min-h-screen flex-col">
      <div className="flex-1">{children}</div>
      <SiteFooter locale={lang} />
    </div>
  );
}