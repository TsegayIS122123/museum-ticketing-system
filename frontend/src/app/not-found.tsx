import Link from 'next/link';
import './globals.css';

/** Unmatched URL outside any locale (e.g. `/typo`). No locale is known
 *  here, so the page is deliberately bilingual. */
export default function RootNotFound() {
  return (
    <html lang="en">
      <body className="flex min-h-screen items-center justify-center bg-stone-50 px-4 text-center antialiased">
        <main>
          <p className="text-sm font-semibold text-brand-primary">404</p>
          <h1 className="mt-2 font-serif text-3xl font-semibold text-stone-900">Page not found</h1>
          <p className="mt-1 text-stone-700">ገጹ አልተገኘም</p>
          <div className="mt-6 flex justify-center gap-3">
            <Link href="/en" className="inline-flex min-h-[44px] items-center rounded-lg bg-brand-primary px-5 text-sm font-medium text-white">Home</Link>
            <Link href="/am" className="inline-flex min-h-[44px] items-center rounded-lg border border-stone-300 px-5 text-sm font-medium text-stone-800">መነሻ</Link>
          </div>
        </main>
      </body>
    </html>
  );
}
