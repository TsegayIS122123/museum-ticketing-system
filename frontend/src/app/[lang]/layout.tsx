import type { Metadata } from 'next';
import { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Science Museum - Ticketing & Booking',
  description: 'Book and manage your museum visit online.',
};

export async function generateStaticParams() {
  return [{ lang: 'en' }, { lang: 'am' }];
}

export default function LangLayout({ children }: { children: ReactNode }) {
  return children;
}