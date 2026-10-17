import { redirect } from 'next/navigation';

// Legacy alias. `/verify` was the visitor phone-OTP entry point; the unified
// email+password sign-in replaces it at `/signin` (FR-ACC-002). Bookmarks and
// any stale `?redirect=` links (e.g. from the "Book a visit" bounce) are
// forwarded, not 404'd.
export default async function VerifyRedirectPage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { lang } = await params;
  const sp = await searchParams;

  const query = new URLSearchParams();
  const redirectTarget = sp.redirect ?? sp.next;
  if (typeof redirectTarget === 'string' && redirectTarget) {
    query.set('redirect', redirectTarget);
  }
  const qs = query.toString();

  redirect(`/${lang}/signin${qs ? `?${qs}` : ''}`);
}
