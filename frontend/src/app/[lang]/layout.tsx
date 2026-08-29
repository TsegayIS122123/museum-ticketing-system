import type { Metadata } from 'next';
import '../globals.css';
import { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Science Museum - Ticketing & Booking',
  description: 'Book and manage your museum visit online.',
};

export async function generateStaticParams() {
  return [{ lang: 'en' }, { lang: 'am' }];
}

interface RootLayoutProps {
  children: ReactNode;
  params: Promise<{ lang: string }>;
}

export default async function RootLayout({ children, params }: RootLayoutProps) {
  const { lang } = await params;

  return (
    <html lang={lang}>
      <body className="antialiased min-h-screen flex flex-col bg-stone-50">
        {children}
      </body>
    </html>
  );
}
