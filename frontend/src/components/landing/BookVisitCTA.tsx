'use client';

import Link from 'next/link';
import { GraduationCap } from 'lucide-react';
import { useAuth } from '@/lib/auth/auth-context';

interface BookVisitCTAProps {
  lang: 'en' | 'am';
  labels: {
    bookNow: string;
    schoolTitle: string;
  };
}

// The landing page's primary action. It is auth-aware on purpose: a
// signed-out visitor is sent to the single front door with `?redirect=/book`
// so the sign-in screen can hand her straight back to the booking wizard
// afterwards, while a signed-in visitor goes to the wizard directly. (The
// wizard and the group form both re-check this themselves -- this is only the
// entry point, never the gate.)
//
// The school / institution path stays a visible button next to it rather than
// a quiet text link (UAT round 1: the old text link went unnoticed) and it is
// auth-aware the same way, pointing at /signin?redirect=/group-visits/new.
export function BookVisitCTA({ lang, labels }: BookVisitCTAProps) {
  const { isAuthenticated, isLoading } = useAuth();

  // While the session is still restoring (`isLoading`), don't paint a link
  // that may be wrong a moment later: assume signed-out, which is the
  // harmless destination -- /signin forwards an already-signed-in user on to
  // the redirect target, so nobody is ever stuck on the sign-in form.
  const signedIn = isAuthenticated && !isLoading;

  const bookHref = signedIn
    ? `/${lang}/book`
    : `/${lang}/signin?redirect=${encodeURIComponent('/book')}`;
  const schoolHref = signedIn
    ? `/${lang}/group-visits/new`
    : `/${lang}/signin?redirect=${encodeURIComponent('/group-visits/new')}`;

  return (
    <div className="flex w-full flex-col items-center gap-3 sm:flex-row sm:justify-center lg:justify-start">
      <Link
        href={bookHref}
        className="btn-sun inline-flex min-h-[52px] w-full max-w-xs items-center justify-center gap-2 rounded-full px-8 py-3 text-base font-bold sm:w-auto sm:max-w-none focus:outline-none focus:ring-4 focus:ring-sun-300 focus:ring-offset-2"
      >
        {labels.bookNow}
      </Link>

      <Link
        href={schoolHref}
        className="inline-flex min-h-[52px] w-full max-w-xs items-center justify-center gap-2 rounded-full border-2 border-brand-primary/25 bg-white/85 px-6 py-3 text-base font-semibold text-brand-primary transition-colors hover:border-brand-primary/50 hover:bg-white sm:w-auto sm:max-w-none focus:outline-none focus:ring-4 focus:ring-primary-200 focus:ring-offset-2"
      >
        <GraduationCap className="h-5 w-5" aria-hidden="true" />
        {labels.schoolTitle}
      </Link>
    </div>
  );
}
