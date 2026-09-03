import Link from 'next/link';

export function SiteFooter({ locale }: { locale: 'en' | 'am' }) {
  return (
    <footer id="contact" className="border-t border-brand-primary/20 bg-brand-footer text-white">
      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-8 text-sm sm:grid-cols-3 sm:px-6 lg:px-8">
        <div>
          <p className="font-semibold">Addis Ababa University Science Museum</p>
          <p className="mt-1 text-white/70">AAU CNCS, 4 Killo, Addis Ababa, Ethiopia</p>
        </div>
        <div id="solutions">
          <p className="font-semibold">Solutions</p>
          <div className="mt-2 flex flex-col gap-1 text-white/75">
            <Link href={`/${locale}/book`} className="hover:text-white hover:underline">Book a visit</Link>
            <Link href={`/${locale}/bookings`} className="hover:text-white hover:underline">Manage bookings</Link>
            <Link href={`/${locale}/verify`} className="hover:text-white hover:underline">Visitor verification</Link>
          </div>
        </div>
        <div>
          <p className="font-semibold">Contact</p>
          <p className="mt-2 text-white/75">+251 900 000 000</p>
          <p className="text-white/75">info@sciencemuseum.et</p>
        </div>
      </div>
      <div className="border-t border-white/15 px-4 py-4 text-center text-xs text-white/65">
        © {new Date().getFullYear()} Science Museum. All rights reserved.
      </div>
    </footer>
  );
}
