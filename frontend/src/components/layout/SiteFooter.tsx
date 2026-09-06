import Link from 'next/link';
import en from '@/lib/i18n/locales/en/common.json';
import am from '@/lib/i18n/locales/am/common.json';

const dictionary = { en, am };

export function SiteFooter({ locale }: { locale: 'en' | 'am' }) {
  const t = dictionary[locale] || dictionary.en;

  return (
    <footer id="contact" className="border-t border-brand-primary/20 bg-brand-footer text-white">
      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-8 text-sm sm:grid-cols-3 sm:px-6 lg:px-8">
        <div>
          <p className="font-semibold">{t.footer_museum_name}</p>
          <p className="mt-1 text-white/70">{t.footer_address}</p>
        </div>
        <div id="solutions">
          <p className="font-semibold">{t.solutions}</p>
          <div className="mt-2 flex flex-col gap-1 text-white/75">
            <Link href={`/${locale}/book`} className="hover:text-white hover:underline">{t.footer_book_a_visit}</Link>
            <Link href={`/${locale}/bookings`} className="hover:text-white hover:underline">{t.footer_manage_bookings}</Link>
            <Link href={`/${locale}/verify`} className="hover:text-white hover:underline">{t.footer_visitor_verification}</Link>
          </div>
        </div>
        <div>
          <p className="font-semibold">{t.contact}</p>
          <p className="mt-2 text-white/75">+251 900 000 000</p>
          <p className="text-white/75">info@sciencemuseum.et</p>
        </div>
      </div>
      <div className="border-t border-white/15 px-4 py-4 text-center text-xs text-white/65">
        © {new Date().getFullYear()} {t.footer_copyright}
      </div>
    </footer>
  );
}
