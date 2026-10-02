'use client';

import './globals.css';

/** Last-resort boundary: the root layout itself failed, so no i18n or
 *  providers are available. Static, bilingual, dependency-free. */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body className="flex min-h-screen items-center justify-center bg-stone-50 px-4 text-center antialiased">
        <main role="alert">
          <h1 className="font-serif text-3xl font-semibold text-stone-900">Something went wrong</h1>
          <p className="mt-1 text-stone-700">የሆነ ችግር ተፈጥሯል</p>
          <button type="button" onClick={reset} className="mt-6 min-h-[44px] cursor-pointer rounded-lg bg-brand-primary px-5 text-sm font-medium text-white">
            Try again / እንደገና ይሞክሩ
          </button>
        </main>
      </body>
    </html>
  );
}
