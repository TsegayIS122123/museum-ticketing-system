'use client';

import { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { Button } from '@/components/ui/Button';
import { QuantityInput } from '@/components/ui/QuantityInput';
import { getCategories } from '@/features/catalog/api';
import type { Category } from '@/features/catalog/schemas';
import { correctBookingCategory, addBookingItem } from '../api';
import type { BookingLookupResponse } from '../api';
import { ApiError } from '@/lib/api/errors';

interface CategoryCorrectionPanelProps {
  booking: BookingLookupResponse;
  onCancel: () => void;
  // `partialError` is set when the batch below stopped partway through --
  // `updated` is still the latest booking state actually persisted on the
  // server (whatever succeeded before the failure), never stale.
  onCorrected: (updated: BookingLookupResponse, partialError?: string) => void;
}

// One row of the correction table -- either an existing BookingItem being
// re-pointed at a different category and/or given a different quantity,
// or a brand-new walk-up line that doesn't exist on the booking yet
// (`itemId: null`). Everything the Cashier can do at the gate -- fixing a
// bad ID, fixing a headcount, moving people between two categories that
// are *both* already on the booking, and adding a walk-up category -- is
// just an edit to this one table; there's no separate "which flow" toggle
// anymore.
interface WorkingLine {
  key: string;
  itemId: string | null;
  categoryId: string;
  quantity: number;
}

let newLineCounter = 0;

interface PlannedOp {
  key: string;
  itemId: string | null;
  categoryId: string;
  quantity: number;
  categoryChanged: boolean;
  quantityChanged: boolean;
  isReopening: boolean; // will flip the booking out of Pending
}

interface CorrectionPlan {
  ordered: PlannedOp[];
  blocked: string | null;
}

// Orders the queued ops into a sequence of PATCH/POST calls that's safe
// to fire at the real, single-item backend, or reports why no such
// sequence exists. See the component docstring below for the two
// backend rules this is enforcing.
function buildCorrectionPlan(
  plannedOps: PlannedOp[],
  originalOwnerByCategory: Map<string, string>,
  t: (key: string) => string | undefined
): CorrectionPlan {
  const editOps = plannedOps.filter((o) => o.itemId !== null);
  const addOps = plannedOps.filter((o) => o.itemId === null);

  // key -> key of the edit op that must be applied first, if this op's
  // target category is currently (server-side) held by another item.
  const blockerKeyByOpKey = new Map<string, string>();
  for (const op of editOps) {
    if (!op.categoryChanged) continue;
    const blockerId = originalOwnerByCategory.get(op.categoryId);
    if (!blockerId || blockerId === op.itemId) continue;
    const blocker = editOps.find((o) => o.itemId === blockerId);
    if (blocker) blockerKeyByOpKey.set(op.key, blocker.key);
  }
  const isDependedOn = (key: string) =>
    editOps.some((o) => blockerKeyByOpKey.get(o.key) === key);

  const reopeningOps = [...editOps, ...addOps].filter((o) => o.isReopening);
  if (reopeningOps.length > 1) {
    return {
      ordered: [],
      blocked:
        t('too_many_reopening_changes') ||
        'Only one change that increases the total can go in a single confirmation -- it reopens payment and blocks any further correction until paid. Remove one of the highlighted changes, confirm the rest, then come back for it.',
    };
  }
  if (reopeningOps.some((o) => isDependedOn(o.key))) {
    return {
      ordered: [],
      blocked:
        t('reopening_blocks_dependent') ||
        "One change needs a category that's only freed up by another change that itself increases the total -- that combination can't be done in one visit. Apply the balance-increasing change on its own first, wait for it to be paid, then come back for the rest.",
    };
  }

  // Kahn's algorithm, preferring a ready non-reopening op at each step so
  // the (at most one) reopening op naturally ends up last.
  const ordered: PlannedOp[] = [];
  const doneKeys = new Set<string>();
  let remaining = editOps;
  while (remaining.length > 0) {
    const ready = remaining.filter((o) => {
      const blockerKey = blockerKeyByOpKey.get(o.key);
      return !blockerKey || doneKeys.has(blockerKey);
    });
    if (ready.length === 0) {
      return {
        ordered: [],
        blocked:
          t('swap_conflict') ||
          "Two of these changes each need the other's category freed up first, so that swap can't be applied directly. Remove one of them, confirm the rest, then come back and move that one into its now-free category.",
      };
    }
    const pick = ready.find((o) => !o.isReopening) ?? ready[0];
    ordered.push(pick);
    doneKeys.add(pick.key);
    remaining = remaining.filter((o) => o.key !== pick.key);
  }
  ordered.push(...addOps);
  return { ordered, blocked: null };
}

// ID-verification addendum to Document 02 Sec 2.2: shown inline on the
// gate check-in screen (AttendanceEntryForm), before check-in.
//
// The backend only exposes two single-item primitives -- PATCH
// .../category-correction (re-price/re-size *one* existing line, or move
// it into a category the booking doesn't have yet) and POST .../items
// (add a brand-new line) -- there is no batch endpoint and no "move N
// from line A to line B" endpoint. Moving people between two categories
// that are *both* already on the booking (e.g. 1 of 3 "Student" holders
// turns out to be an "Adult") only works as two of those PATCH calls: a
// quantity-only decrement on the Student line and a quantity-only
// increment on the Adult line -- never a category change on either,
// since correct_booking_category rejects re-pointing a line at a
// category another line already holds.
//
// This component lets the Cashier make as many such edits as the
// situation needs -- category fixes, headcount fixes, category-to-
// category moves (expressed just by editing two rows' quantities), and
// walk-up adds -- in one table, then fires the whole batch off as a
// sequence of those same PATCH/POST calls on a single Confirm click. Two
// backend rules constrain what a single confirm can contain:
//
// 1. `correct_booking_category`/`add_booking_item` both require the
//    booking to still be `Pending`, and both flip it to
//    `AwaitingPayment` the moment a change is a net undercharge (or, for
//    an add, unconditionally) -- so at most one such "reopening" change
//    can be in a batch, and it must run last, or every call after it
//    would 409.
// 2. A row can only be pointed at a category currently held by another
//    row once that other row's own edit has already gone through on the
//    server -- so category moves have to run in dependency order, and a
//    genuine two-way swap (A wants B's category, B wants A's) can't be
//    expressed as a sequence of single-item calls at all.
//
// `plan` below computes that order and refuses to submit (with an
// explanation) when either rule can't be satisfied.
export function CategoryCorrectionPanel({
  booking,
  onCancel,
  onCorrected,
}: CategoryCorrectionPanelProps) {
  const { t, locale } = useTranslation();
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoadingCategories, setIsLoadingCategories] = useState(true);
  const [lines, setLines] = useState<WorkingLine[]>(() =>
    booking.items.map((item) => ({
      key: item.id,
      itemId: item.id,
      categoryId: item.categoryId,
      quantity: item.quantity,
    }))
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getCategories()
      .then((data) => {
        if (!cancelled) setCategories(data);
      })
      .catch(() => {
        if (!cancelled) {
          setError(t('categories_load_failed') || 'Could not load categories.');
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoadingCategories(false);
      });
    return () => {
      cancelled = true;
    };
    // `t` intentionally excluded: useTranslation() returns a new function
    // reference every render, so including it here would refire this
    // fetch on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const originalItemById = useMemo(() => new Map(booking.items.map((i) => [i.id, i])), [booking.items]);
  // Which item currently (server-side, right now) holds each category --
  // the dependency map the execution order below is built from.
  const originalOwnerByCategory = useMemo(
    () => new Map(booking.items.map((i) => [i.categoryId, i.id])),
    [booking.items]
  );

  const categoryLabel = (c: Category) =>
    `${locale === 'en' ? c.name_en : c.name_am} -- ETB ${c.price_etb}`;

  const updateLine = (key: string, patch: Partial<WorkingLine>) => {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  };

  const removeLine = (key: string) => {
    // Only ever called for a not-yet-submitted walk-up row (see the JSX
    // below) -- an existing BookingItem can't be deleted through this
    // API, so it's never given a remove button.
    setLines((prev) => prev.filter((l) => l.key !== key));
  };

  const addLine = () => {
    const used = new Set(lines.map((l) => l.categoryId));
    const next = categories.find((c) => !used.has(c.id));
    if (!next) return;
    newLineCounter += 1;
    setLines((prev) => [
      ...prev,
      { key: `new-${newLineCounter}`, itemId: null, categoryId: next.id, quantity: 1 },
    ]);
  };

  const addableCategoriesExist = categories.some((c) => !lines.some((l) => l.categoryId === c.id));

  // ---- Diff each row against the booking's actual current items --------

  const plannedOps = useMemo<PlannedOp[]>(() => {
    const ops: PlannedOp[] = [];
    for (const line of lines) {
      if (line.itemId === null) {
        // Walk-up add -- always a brand-new BookingItem, so
        // add_booking_item unconditionally reopens payment for it
        // (there's no existing subtotal for the price to net against).
        ops.push({
          key: line.key,
          itemId: null,
          categoryId: line.categoryId,
          quantity: line.quantity,
          categoryChanged: true,
          quantityChanged: true,
          isReopening: true,
        });
        continue;
      }
      const original = originalItemById.get(line.itemId);
      if (!original) continue;
      const categoryChanged = line.categoryId !== original.categoryId;
      const quantityChanged = line.quantity !== original.quantity;
      if (!categoryChanged && !quantityChanged) continue; // nothing to send for this row

      // Re-priced at the category's *current* active price, mirroring
      // correct_booking_category's own re-snapshotting -- not whatever
      // unitPriceEtb happened to be recorded when the booking was made.
      const oldSubtotal = Number(original.subtotalEtb);
      const newCategory = categoryById.get(line.categoryId);
      const newUnitPrice = newCategory ? Number(newCategory.price_etb) : Number(original.unitPriceEtb);
      const predictedDelta = newUnitPrice * line.quantity - oldSubtotal;

      ops.push({
        key: line.key,
        itemId: line.itemId,
        categoryId: line.categoryId,
        quantity: line.quantity,
        categoryChanged,
        quantityChanged,
        isReopening: predictedDelta > 0,
      });
    }
    return ops;
  }, [lines, categoryById, originalItemById]);

  // ---- Execution order + feasibility ------------------------------------
  //
  // Deliberately not wrapped in useMemo: this is a plain, cheap function
  // over a handful of rows (a booking has a handful of line items, not
  // hundreds), and its topological sort mutates local working copies
  // (`blockerKeyByOpKey`, `doneKeys`) that the React Compiler can't prove
  // are safe to treat as memoizable -- recomputing it every render is
  // simpler and just as fast as fighting that.

  const plan = buildCorrectionPlan(plannedOps, originalOwnerByCategory, t);

  const hasChanges = plannedOps.length > 0;
  const reopeningKey = plannedOps.find((o) => o.isReopening)?.key ?? null;

  const handleSubmit = async () => {
    if (!hasChanges || plan.blocked || isSubmitting) return;
    setIsSubmitting(true);
    setError(null);
    setProgress({ done: 0, total: plan.ordered.length });
    let latest = booking;
    try {
      for (let i = 0; i < plan.ordered.length; i++) {
        const op = plan.ordered[i];
        latest =
          op.itemId === null
            ? await addBookingItem(booking.id, { categoryId: op.categoryId, quantity: op.quantity })
            : await correctBookingCategory(booking.id, op.itemId, {
                categoryId: op.categoryChanged ? op.categoryId : undefined,
                quantity: op.quantityChanged ? op.quantity : undefined,
              });
        setProgress({ done: i + 1, total: plan.ordered.length });
      }
      onCorrected(latest);
    } catch (err) {
      // Whatever already went through above is already committed
      // server-side -- hand the parent the latest booking actually
      // returned so it isn't left showing stale data, and say so rather
      // than pretending the whole batch failed cleanly.
      const message =
        err instanceof ApiError
          ? err.message
          : t('correction_failed') || 'Failed to apply that change. Please try again.';
      onCorrected(
        latest,
        (t('correction_partial') || 'Some changes were applied before this one failed:') + ' ' + message
      );
    } finally {
      setIsSubmitting(false);
      setProgress(null);
    }
  };

  return (
    <div className="mt-4 border-t border-stone-200 pt-4">
      <div className="text-sm font-medium text-stone-700 mb-2">
        {t('correct_category_prompt') ||
          "Fix a ticket-holder's category or headcount, move people between categories already on this booking, or add a walk-up category -- queue up everything that's needed below, then confirm once:"}
      </div>

      {isLoadingCategories ? (
        <div className="text-sm text-stone-500">{t('loading') || 'Loading...'}</div>
      ) : (
        <div className="space-y-2">
          {lines.map((line) => {
            const original = line.itemId ? originalItemById.get(line.itemId) : undefined;
            const usedElsewhere = new Set(
              lines.filter((l) => l.key !== line.key).map((l) => l.categoryId)
            );
            const options = categories.filter(
              (c) => c.id === line.categoryId || !usedElsewhere.has(c.id)
            );
            // getCategories() is active-only -- if this line's own current
            // category has since been retired, it won't be in `options`
            // above even though it's still the item's real category. Keep
            // it selectable (as a no-op "leave it" choice) rather than
            // letting the <select> silently fall back to whatever option
            // happens to render first.
            if (original && !options.some((c) => c.id === line.categoryId)) {
              options.unshift({
                id: line.categoryId,
                name_en: original.categoryNameEn,
                name_am: original.categoryNameAm,
                price_etb: original.unitPriceEtb,
                is_free: Number(original.unitPriceEtb) === 0,
                active: false,
              } as Category);
            }
            const op = plannedOps.find((o) => o.key === line.key);
            const changed = !!op;

            return (
              <div
                key={line.key}
                className={`rounded-lg border p-2 ${
                  changed ? 'border-secondary-400 bg-secondary-50' : 'border-stone-200 bg-white'
                }`}
              >
                <div className="flex items-center gap-2">
                  <select
                    value={line.categoryId}
                    onChange={(e) => updateLine(line.key, { categoryId: e.target.value })}
                    className="flex-1 px-3 py-2 rounded-lg border border-stone-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-secondary-500"
                  >
                    {options.map((c) => (
                      <option key={c.id} value={c.id}>
                        {categoryLabel(c)}
                      </option>
                    ))}
                  </select>
                  <QuantityInput
                    value={line.quantity}
                    onChange={(q) => updateLine(line.key, { quantity: q })}
                    min={1}
                    max={999}
                  />
                  {line.itemId === null && (
                    <button
                      type="button"
                      onClick={() => removeLine(line.key)}
                      className="text-stone-400 hover:text-stone-600 p-1"
                      aria-label={t('remove') || 'Remove'}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
                {changed && original && (
                  <div className="text-xs text-secondary-700 mt-1">
                    {(t('was') || 'Was')}:{' '}
                    {locale === 'en' ? original.categoryNameEn : original.categoryNameAm} x
                    {original.quantity}
                    {op?.isReopening &&
                      ` -- ${t('reopens_payment') || 'reopens payment for the difference'}`}
                  </div>
                )}
                {changed && !original && (
                  <div className="text-xs text-secondary-700 mt-1">
                    {t('new_walkup_line') || 'New walk-up line -- reopens payment for its full price'}
                  </div>
                )}
                {line.itemId !== null && line.quantity === 1 && (
                  <div className="text-xs text-stone-400 mt-1">
                    {t('cannot_zero_out') ||
                      "Can't go below 1 -- there's no way to fully remove a category line yet."}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={addLine}
          disabled={isLoadingCategories || !addableCategoriesExist}
        >
          + {t('add_new_category_tab') || 'Add a walk-up category'}
        </Button>
        {!isLoadingCategories && !addableCategoriesExist && (
          <span className="text-xs text-stone-400 ml-2">
            {t('no_addable_categories') || 'Every active category is already on this booking.'}
          </span>
        )}
      </div>

      {plan.blocked && <div className="text-sm text-amber-700 mt-3">{plan.blocked}</div>}
      {error && <div className="text-sm text-red-600 mt-2">{error}</div>}
      {progress && (
        <div className="text-sm text-stone-500 mt-2">
          {t('applying_changes') || 'Applying change'}{' '}
          {Math.min(progress.done + 1, progress.total)} {t('of') || 'of'} {progress.total}...
        </div>
      )}

      <div className="flex gap-3 mt-3">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="flex-1"
          onClick={onCancel}
          disabled={isSubmitting}
        >
          {t('cancel') || 'Cancel'}
        </Button>
        <Button
          type="button"
          size="sm"
          className="flex-1 bg-brand-primary hover:bg-primary-700"
          onClick={handleSubmit}
          disabled={isSubmitting || !hasChanges || !!plan.blocked}
        >
          {isSubmitting
            ? t('processing') || 'Processing...'
            : hasChanges
              ? `${t('confirm') || 'Confirm'} (${plannedOps.length})`
              : t('confirm') || 'Confirm'}
        </Button>
      </div>
      {reopeningKey && !plan.blocked && (
        <div className="text-xs text-stone-400 mt-2">
          {t('one_reopening_note') ||
            'One of the queued changes increases the total, so it will be applied last and will reopen payment.'}
        </div>
      )}
    </div>
  );
}
