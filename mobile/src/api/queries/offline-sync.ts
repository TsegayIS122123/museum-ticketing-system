import { isApiError } from '@/api/errors';
import { checkInBooking } from './gate';

/**
 * Offline cashier check-in client.
 *
 * This file used to call two endpoints that exist nowhere -- not in
 * `contracts/openapi.yaml`, not in `config/urls.py`, not in any doc:
 * `POST /entrance/offline-sync/` and `GET /mobile/cashier/bookings/`.
 * The first one 404ed on every sync attempt, so queued check-ins never
 * reached the server; the second was never called. A referenced
 * "Phase 0 backend prerequisite" turned out to be as absent as the
 * routes (`docs/09` has no such section). Both now go through the real
 * API:
 *
 *   - sync  -> `POST /bookings/{id}/check-in/` (`apps/entrance/views.py`,
 *              `CheckInView`)
 *   - seed  -> `GET /bookings/?visitDate=...` (`listBookings`,
 *              `apps/bookings/views.py`)
 *
 * The check-in call takes no request body and flips the booking to
 * `visited` with `attended_quantity = booked_quantity`
 * (`services.check_in_booking`); it is naturally idempotent for this
 * queue, because a replayed check-in of an already-visited booking is a
 * 409 rather than a second write. Note the open product question this
 * leaves: `docs/05-database-design.md` and FR-TICKET-005 describe the
 * Cashier recording an attended count at the gate, while UAT round 1
 * removed that from the check-in call (a shortfall is handled by
 * `POST /bookings/{id}/flag-mismatch/` plus a Manager correction). The
 * queue therefore keeps `attendedQuantity` as a *local* record of what
 * the Cashier entered (docs/05 still wants it) but cannot transmit it --
 * `CheckInForm`'s stepper has no server-side destination today, online
 * or offline. That is a backend decision, not a client one.
 */

export interface SyncCheckInPayload {
  idempotencyKey: string;
  bookingId: string;
  reference: string;
  attendedQuantity: number;
  occurredAt: string; // ISO timestamp from the cashier's device
}

export type SyncStatus = 'accepted' | 'rejected' | 'conflict';

export interface SyncResult {
  status: SyncStatus;
  reason?: string;
}

/**
 * Send one offline check-in to the server.
 *
 * Returns:
 *   - `accepted` — booking is now `visited` server-side
 *   - `rejected` — permanent failure: bad id (404) or the request is not
 *     allowed for this account (400/403)
 *   - `conflict` — 409: the booking is no longer `Pending`, either because
 *     another Cashier already checked it in or because it carries an open
 *     mismatch flag awaiting a Manager correction
 *
 * Anything else (no HTTP status at all -- offline, DNS, timeout -- or a
 * 5xx) is rethrown so the queue keeps the item and retries it later.
 */
export async function syncCheckIn(payload: SyncCheckInPayload): Promise<SyncResult> {
  try {
    await checkInBooking(payload.bookingId);
    return { status: 'accepted' };
  } catch (err) {
    if (isApiError(err)) {
      if (err.status === 409) {
        return { status: 'conflict', reason: err.message };
      }
      if (err.status === 400 || err.status === 403 || err.status === 404) {
        return { status: 'rejected', reason: err.message };
      }
    }
    throw err;
  }
}
