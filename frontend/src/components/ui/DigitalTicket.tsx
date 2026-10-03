'use client';

import { useTranslation } from '@/lib/i18n/useTranslation';

interface DigitalTicketProps {
  reference: string;
  visitDateLabel: string;
  categorySummary: string;
  className?: string;
}

// Real die-cut notches. Each half of the ticket masks out a semicircle at
// its two inner corners, so the page behind (now an animated gradient, not
// a flat colour) shows through. The previous version painted beige circles
// over the edge, which only worked on a flat stone-50 background.
const notchTop =
  'radial-gradient(circle 13px at 0 100%, #0000 98%, #000) left / 51% 100% no-repeat,' +
  'radial-gradient(circle 13px at 100% 100%, #0000 98%, #000) right / 51% 100% no-repeat';
const notchBottom =
  'radial-gradient(circle 13px at 0 0, #0000 98%, #000) left / 51% 100% no-repeat,' +
  'radial-gradient(circle 13px at 100% 0, #0000 98%, #000) right / 51% 100% no-repeat';

/**
 * The one deliberately theatrical moment in the visitor product: rendered
 * by bookings/[id]/page.tsx once a booking is paid and upcoming. A literal
 * ticket stub -- a sunny blue "event" half with a little savanna along its
 * foot, a perforated line with real punched notches, and a white "admit
 * one" half with the reference code and a decorative bar strip. A slow
 * light sheen sweeps across it.
 *
 * No QR code on purpose: gate staff don't currently have scanning
 * equipment, so the stub surfaces the reference code, which they look up
 * manually. Re-add a QRCodeSVG in the stub half if that changes.
 */
export function DigitalTicket({ reference, visitDateLabel, categorySummary, className = '' }: DigitalTicketProps) {
  const { t } = useTranslation();

  return (
    <div className={`ticket-reveal mx-auto max-w-md ${className}`} style={{ filter: 'drop-shadow(0 14px 18px rgb(1 50 78 / 0.14))' }}>
      <div className="relative overflow-hidden rounded-t-2xl text-white" style={{ WebkitMask: notchTop, mask: notchTop }}>
        <div className="bg-gradient-to-br from-primary-700 via-primary-500 to-sky-400 px-6 pb-14 pt-5">
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold uppercase tracking-wider text-white/80">
              {t('museum_name') || 'Zoological Natural History Museum'}
            </div>
            <span className="rounded-full bg-sun-400 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-widest text-amber-950">
              {t('digital_ticket') || 'Digital Ticket'}
            </span>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div>
              <div className="text-xs uppercase tracking-wide text-white/70">{t('date') || 'Date'}</div>
              <div className="mt-0.5 text-base font-bold leading-snug">{visitDateLabel}</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-white/70">{t('category')}</div>
              <div className="mt-0.5 text-base font-bold leading-snug">{categorySummary}</div>
            </div>
          </div>
        </div>
        {/* sun + hills along the foot of the event half */}
        <svg className="pointer-events-none absolute inset-x-0 bottom-0 h-14 w-full" viewBox="0 0 400 56" preserveAspectRatio="none" aria-hidden="true">
          <circle cx="332" cy="22" r="14" fill="#ffd166" />
          <path d="M0 40 C60 18 120 22 190 38 C250 52 320 28 400 36 L400 56 L0 56 Z" fill="#2fd29a" />
          <path d="M0 50 C80 36 160 52 240 46 C310 41 360 46 400 44 L400 56 L0 56 Z" fill="#0fb27f" />
        </svg>
        {/* ticket sheen */}
        <div className="ticket-sheen pointer-events-none absolute inset-0" aria-hidden="true" />
      </div>

      {/* perforation */}
      <div className="mx-[13px] border-t-2 border-dashed border-stone-300/90" aria-hidden="true" />

      <div className="rounded-b-2xl bg-white px-6 pb-6 pt-5 text-center" style={{ WebkitMask: notchBottom, mask: notchBottom }}>
        <div className="font-mono text-2xl font-extrabold tracking-[0.25em] text-stone-900">{reference}</div>
        <div className="mx-auto mt-3 flex h-8 max-w-[15rem] items-stretch justify-center gap-[3px]" aria-hidden="true">
          {Array.from({ length: 34 }, (_, i) => (
            <span key={i} className="rounded-[1px] bg-stone-800" style={{ width: 1 + ((i * 7) % 4) }} />
          ))}
        </div>
        <div className="mt-3 text-xs text-stone-600">{t('show_at_gate') || 'Show this reference code at the museum entrance'}</div>
      </div>
    </div>
  );
}
