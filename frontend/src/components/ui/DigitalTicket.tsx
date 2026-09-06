'use client';

import { useTranslation } from '@/lib/i18n/useTranslation';
import { QRCodeSVG } from './QRCodeSVG';

interface DigitalTicketProps {
  reference: string;
  visitDateLabel: string;
  categorySummary: string;
  className?: string;
}

/**
 * The one deliberately theatrical moment in the visitor product -- this
 * is what bookings/[id]/page.tsx renders once a booking is paid and
 * upcoming (booking.status === 'pending'), which per apps/payments/
 * services.py's Chapa `return_url` is also exactly where a visitor
 * lands right after paying. Everywhere else on that page (the booking
 * info grid, pay-now card, cancel/reschedule controls) is left as-is on
 * purpose, so this stays the one screen that looks like a spectacle.
 *
 * The shape is a literal ticket stub: a brand-blue "event" half and a
 * white "admit one" half, split by a perforated line with two notches
 * punched out of the edges. The notch circles are painted the exact
 * color of the page background (stone-50) sitting on top of the card,
 * which is what makes them read as die-cut holes instead of dots --
 * this only works because the card's parent is always that background;
 * if this component is ever placed on a differently-colored surface,
 * update `--ticket-notch-bg` at the call site.
 */
export function DigitalTicket({
  reference,
  visitDateLabel,
  categorySummary,
  className = '',
}: DigitalTicketProps) {
  const { t } = useTranslation();

  return (
    <div
      className={`ticket-reveal relative mx-auto max-w-md overflow-hidden rounded-2xl shadow-lg ${className}`}
    >
      {/* Event half */}
      <div className="bg-brand-primary text-white px-6 py-5">
        <div className="text-xs font-semibold uppercase tracking-wider text-white/70">
          {t('museum_name') || 'Science Museum'}
        </div>
        <div className="mt-1 text-lg font-bold">
          {t('digital_ticket') || 'Digital Ticket'}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
          <div>
            <div className="text-white/60 text-xs uppercase tracking-wide">{t('date') || 'Date'}</div>
            <div className="font-medium">{visitDateLabel}</div>
          </div>
          <div>
            <div className="text-white/60 text-xs uppercase tracking-wide">{t('category')}</div>
            <div className="font-medium truncate">{categorySummary}</div>
          </div>
        </div>
      </div>

      {/* Perforated divider with punched notches */}
      <div className="relative h-0 border-t-2 border-dashed border-stone-300">
        <div
          aria-hidden="true"
          className="absolute -left-3 -top-3 h-6 w-6 rounded-full"
          style={{ background: 'var(--ticket-notch-bg, var(--color-stone-50))' }}
        />
        <div
          aria-hidden="true"
          className="absolute -right-3 -top-3 h-6 w-6 rounded-full"
          style={{ background: 'var(--ticket-notch-bg, var(--color-stone-50))' }}
        />
      </div>

      {/* Stub half -- QR + reference, sized to actually be scannable */}
      <div className="bg-white px-6 py-6 text-center">
        <div className="flex justify-center">
          <div className="rounded-xl border border-stone-200 bg-white p-3 shadow-inner">
            <QRCodeSVG value={reference} size={172} />
          </div>
        </div>
        <div className="mt-4 font-mono text-lg font-bold tracking-[0.2em] text-stone-900">
          {reference}
        </div>
        <div className="mt-1 text-xs text-stone-500">
          {t('show_at_gate') || 'Show this QR code at the museum entrance'}
        </div>
      </div>
    </div>
  );
}
