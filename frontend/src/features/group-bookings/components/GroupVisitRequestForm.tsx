'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Pin, GraduationCap, CalendarDays } from 'lucide-react';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { useAuth } from '@/lib/auth/auth-context';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { QuantityInput } from '@/components/ui/QuantityInput';
import { Toast } from '@/components/ui/Toast';
import { AvailabilityDatePicker } from '@/features/booking/components/AvailabilityDatePicker';
import { submitGroupBooking, lookupInstitutionByTin } from '../api';
import { groupVisitRequestSchema, type GroupVisitRequestInput } from '../schemas';
import { getCategories } from '@/features/catalog/api';
import type { Category } from '@/features/catalog/schemas';

interface GroupVisitRequestFormProps {
  onSuccess?: () => void;
}

export function GroupVisitRequestForm({ onSuccess }: GroupVisitRequestFormProps) {
  const { t, locale } = useTranslation();
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading } = useAuth();

  // POST /bookings/ requires the visitor to already be logged in/OTP
  // verified -- there is no anonymous path. Redirect rather than let the
  // submit silently 401.
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push(`/${locale}/verify?next=/${locale}/group-visits/new`);
    }
  }, [authLoading, isAuthenticated, locale, router]);

  const [categories, setCategories] = useState<Category[]>([]);
  useEffect(() => {
    getCategories()
      .then(setCategories)
      .catch(() => setCategories([]));
  }, []);

  // `items` mirrors the individual-booking flow's own `BookingItemInput`
  // list (features/booking/components/DateCategoryPicker) -- a group
  // visit is just as capable of mixing categories in one booking, e.g.
  // 25 Student tickets plus 2 Adult/Teacher tickets for the
  // accompanying staff, rather than being limited to a single category
  // for the whole party.
  const [items, setItems] = useState<{ categoryId: string; quantity: number }[]>([]);
  const [visitDate, setVisitDate] = useState('');
  const [groupName, setGroupName] = useState('');
  const [groupTin, setGroupTin] = useState('');
  const [groupContactPhone, setGroupContactPhone] = useState('');
  // UAT round 1: autofills groupName from a matching Institution once
  // the TIN field reaches 10 digits, so returning schools don't have to
  // retype (and risk re-spelling) their own name every visit. Only ever
  // overwrites a *blank* groupName, or one this same effect filled in
  // last time (`autofilledName`) -- never something the booker typed
  // themselves, matching-TIN or not; see `resolve_institution`'s own
  // docstring for how a booker overriding the name is still handled at
  // submit time (last-typed-name-wins, audit-logged), not blocked here.
  const [autofilledName, setAutofilledName] = useState<string | null>(null);
  // The lookup result is stored with the TIN it answered, and the match
  // shown is *derived*: it only applies while the field still holds that
  // exact TIN. So editing the TIN away from a matched one drops the
  // "Recognised" confirmation immediately, with no setState in the effect.
  const [lookup, setLookup] = useState<{ tin: string; name: string } | null>(null);
  const cleanedTin = groupTin.replace(/[\s-]/g, '');
  const institutionMatch =
    /^\d{10}$/.test(cleanedTin) && lookup?.tin === cleanedTin ? { name: lookup.name } : null;

  useEffect(() => {
    const cleaned = groupTin.replace(/[\s-]/g, '');
    if (!/^\d{10}$/.test(cleaned)) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const institution = await lookupInstitutionByTin(cleaned);
        if (cancelled) return;
        setLookup(institution ? { tin: cleaned, name: institution.name } : null);
        if (institution && (groupName.trim() === '' || groupName === autofilledName)) {
          setGroupName(institution.name);
          setAutofilledName(institution.name);
        }
      } catch {
        // A failed lookup just means no autofill this time -- the
        // booker can still type the name themselves and submit
        // normally; this is a convenience, not a required step.
        if (!cancelled) setLookup(null);
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupTin]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const quantityFor = (categoryId: string) =>
    items.find((item) => item.categoryId === categoryId)?.quantity ?? 0;

  const setQuantityFor = (categoryId: string, quantity: number) => {
    const withoutCategory = items.filter((item) => item.categoryId !== categoryId);
    // A category dropped to 0 leaves the list entirely rather than
    // sitting in it as a zero-quantity row -- `items` is exactly the
    // set of `{categoryId, quantity}` pairs services.create_booking
    // expects, and it rejects a zero quantity.
    setItems(quantity > 0 ? [...withoutCategory, { categoryId, quantity }] : withoutCategory);
    if (errors.items) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors.items;
        return newErrors;
      });
    }
  };

  const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
  const totalAmount = items.reduce((sum, item) => {
    const category = categories.find((c) => c.id === item.categoryId);
    return sum + (category ? Number(category.price_etb) * item.quantity : 0);
  }, 0);

  const clearError = (field: string) => {
    if (errors[field]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  const validateForm = (): GroupVisitRequestInput | null => {
    const result = groupVisitRequestSchema.safeParse({
      items,
      visitDate,
      groupName,
      groupTin,
      groupContactPhone,
    });
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.errors.forEach((err) => {
        if (err.path[0]) {
          fieldErrors[err.path[0].toString()] = err.message;
        }
      });
      setErrors(fieldErrors);
      return null;
    }
    setErrors({});
    return result.data;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const validated = validateForm();
    if (!validated) {
      setToast({
        message: t('please_fix_errors') || 'Please fix the errors in the form.',
        type: 'error',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const booking = await submitGroupBooking({
        items: validated.items,
        visitDate: validated.visitDate,
        groupName: validated.groupName,
        groupTin: validated.groupTin,
        groupContactPhone: validated.groupContactPhone || null,
      });
      // Same interpolation gap as book/page.tsx's handleConfirmBooking:
      // the reference must be appended explicitly, not folded into the
      // `||` fallback.
      setToast({
        message: `${t('booking_created') || 'Booking created successfully! Reference:'} ${booking.reference}`,
        type: 'success',
      });

      if (onSuccess) {
        onSuccess();
      } else {
        setTimeout(() => {
          router.push(`/${locale}/bookings`);
        }, 3000);
      }
    } catch (error: any) {
      setToast({
        message: error.message || t('group_request_failed') || 'Failed to submit group visit request.',
        type: 'error',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      <Card>
        <div className="space-y-4">
          <h3 className="flex items-center gap-3 text-lg font-bold text-stone-900">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-sun-400 to-sun-600 text-white shadow" aria-hidden="true"><GraduationCap className="h-5 w-5" /></span>
            {t('group_details') || 'Group Details'}
          </h3>

          <TextField
            id="groupName"
            label={t('group_name') || 'Group / School Name'}
            placeholder="e.g., Addis Ababa University"
            value={groupName}
            onChange={(e) => {
              setGroupName(e.target.value);
              clearError('groupName');
            }}
            error={errors.groupName}
          />

          <TextField
            id="groupTin"
            label={t('group_tin') || 'Group / Institution TIN'}
            placeholder="e.g., 0000900158"
            value={groupTin}
            onChange={(e) => {
              setGroupTin(e.target.value);
              clearError('groupTin');
            }}
            error={errors.groupTin}
          />
          <p className="text-xs text-stone-500 -mt-3">
            {t('group_tin_help') ||
              "Your institution's Tax Identification Number, needed for the finance office's receipt voucher."}
          </p>
          {institutionMatch && (
            <p className="text-xs text-secondary-700 -mt-3">
              {(t('institution_matched') || 'Matched institution on file:') + ' '}
              <span className="font-medium">{institutionMatch.name}</span>
            </p>
          )}

          <TextField
            id="groupContactPhone"
            label={t('group_contact_phone') || 'Group Contact Phone (optional)'}
            placeholder="+251 912 345 678"
            value={groupContactPhone}
            onChange={(e) => {
              setGroupContactPhone(e.target.value);
              clearError('groupContactPhone');
            }}
            error={errors.groupContactPhone}
          />

          {/* No organization/contact-person/email/visit-time/special-requests
              fields here -- none of them exist on the backend
              (BookingCreateRequest). Your account's own email/phone are
              used for any notifications. */}
        </div>
      </Card>

      <Card>
        <div className="space-y-4">
          <h3 className="flex items-center gap-3 text-lg font-bold text-stone-900">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-sky-400 to-primary-500 text-white shadow" aria-hidden="true"><CalendarDays className="h-5 w-5" /></span>
            {t('visit_details') || 'Visit Details'}
          </h3>

          <div>
            <span id="group-visit-date-label" className="text-sm font-medium text-stone-700">
              {t('visit_date') || 'Visit Date'} *
            </span>
            {/* Same AvailabilityDatePicker used by the individual booking
                flow (features/booking/components/AvailabilityDatePicker)
                instead of a bare input[type=date] -- this is the only
                calendar in the app that's aware of the dates the Museum
                Manager has closed to booking (GET /availability), so a
                group/school visit now sees the same closed-date
                grid-cells the individual flow does, rather than being
                able to pick a date that would later 409. */}
            <div className="mt-1" role="group" aria-labelledby="group-visit-date-label">
              <AvailabilityDatePicker
                value={visitDate}
                onChange={(date) => {
                  setVisitDate(date);
                  clearError('visitDate');
                }}
              />
            </div>
            {errors.visitDate && (
              <span className="text-xs text-red-500 mt-1">{errors.visitDate}</span>
            )}
          </div>

          {/* Category + quantity breakdown -- e.g. 25 Student tickets
              plus 2 Adult/Teacher tickets for the accompanying staff, in
              the same group booking, rather than one category for the
              whole party. */}
          <div>
            <span id="group-size-label" className="text-sm font-medium text-stone-700">
              {t('group_size_by_category') || 'Group Size by Category'} *
            </span>
            <div className="space-y-3 mt-2" role="group" aria-labelledby="group-size-label">
              {categories.map((category, ci) => (
                <div
                  key={category.id}
                  className={`
                    lift p-4 rounded-2xl border-2 border-l-8 flex flex-wrap items-center justify-between gap-4 transition-all bg-white/80
                    ${quantityFor(category.id) > 0
                      ? 'border-secondary-600 bg-secondary-50 ring-2 ring-secondary-200'
                      : 'border-stone-200'
                    }
                  `}
                  style={quantityFor(category.id) > 0 ? undefined : { borderLeftColor: ['#29c3f5', '#ffbe0b', '#2fd29a', '#ff6b6b', '#9b6bff'][ci % 5] }}
                >
                  <div>
                    <div className="font-semibold text-stone-900">
                      {locale === 'en' ? category.name_en : category.name_am}
                    </div>
                    <div className="mt-1 text-sm font-bold text-primary-600">
                      {`ETB ${category.price_etb}`}
                    </div>
                  </div>
                  <QuantityInput
                    value={quantityFor(category.id)}
                    onChange={(quantity) => setQuantityFor(category.id, quantity)}
                    min={0}
                    max={999}
                  />
                </div>
              ))}
            </div>
            {errors.items && (
              <span className="text-xs text-red-500 mt-1 block">{errors.items}</span>
            )}
          </div>

          {items.length > 0 && (
            <div className="flex items-center justify-between text-sm text-stone-600 border-t border-stone-200 pt-3">
              <span>
                {totalQuantity} {t('tickets') || 'tickets'}
              </span>
              <span className="text-lg font-bold text-primary-600">
                ETB {totalAmount.toFixed(2)}
              </span>
            </div>
          )}

          <div className="rounded-2xl border border-sun-400/60 bg-gradient-to-r from-sun-300/25 to-sun-300/5 p-4 text-sm text-amber-950">
            <span className="font-semibold inline-flex items-center gap-1.5"><Pin className="w-3.5 h-3.5" /> {t('group_booking_note') || 'Important Information'}</span>
            <ul className="mt-1 list-disc list-inside space-y-0.5 text-xs">
              <li>{t('group_booking_note_1') || 'You will pay for the whole group in one transaction.'}</li>
              <li>{t('group_booking_note_2') || 'Bring your booking reference to the gate for the group.'}</li>
            </ul>
          </div>
        </div>
      </Card>

      <div className="flex gap-4">
        <Button
          type="button"
          variant="secondary"
          size="lg"
          className="flex-1"
          onClick={() => router.push(`/${locale}`)}
          disabled={isSubmitting}
        >
          {t('cancel') || 'Cancel'}
        </Button>
        <Button
          type="submit"
          size="lg"
          className="flex-1 bg-brand-primary hover:bg-primary-700"
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            t('submitting') || 'Submitting...'
          ) : (
            <>
              {t('submit_request') || 'Submit Request'} <ArrowRight className="w-4 h-4" />
            </>
          )}
        </Button>
      </div>
    </form>
  );
}
