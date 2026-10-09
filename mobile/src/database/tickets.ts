import { getDb, isSqliteAvailable } from './index';
import { CACHE_TABLE, CACHE_TTL_MS } from './schema';

/**
 * The shape cached locally — a subset of the API's Booking plus the raw
 * payload for re-rendering the detail screen offline.
 */
export interface CachedTicket {
  reference: string;
  bookingId: string;
  status: string;
  visitDate: string;
  categoryNameEn: string | null;
  categoryNameAm: string | null;
  quantity: number | null;
  totalEtb: string | null;
  payloadJson: string;
  syncedAt: number;
}

interface TicketInput {
  reference: string;
  bookingId: string;
  status: string;
  visitDate: string;
  categoryNameEn?: string | null;
  categoryNameAm?: string | null;
  quantity?: number | null;
  totalEtb?: string | null;
  payload: unknown;
}

/**
 * Upsert a ticket into the local cache.
 *
 * Only `pending` bookings are stored. A booking in any other status is
 * evicted — a void ticket must never render offline.
 */
export async function cacheTicket(input: TicketInput): Promise<void> {
  if (!isSqliteAvailable()) return;

  if (input.status !== 'pending') {
    await evictTicket(input.reference);
    return;
  }

  const db = await getDb();
  await db.runAsync(
    `INSERT INTO ${CACHE_TABLE}
       (reference, booking_id, status, visit_date,
        category_name_en, category_name_am, quantity, total_etb,
        payload_json, synced_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(reference) DO UPDATE SET
       status = excluded.status,
       visit_date = excluded.visit_date,
       category_name_en = excluded.category_name_en,
       category_name_am = excluded.category_name_am,
       quantity = excluded.quantity,
       total_etb = excluded.total_etb,
       payload_json = excluded.payload_json,
       synced_at = excluded.synced_at`,
    [
      input.reference,
      input.bookingId,
      input.status,
      input.visitDate,
      input.categoryNameEn ?? null,
      input.categoryNameAm ?? null,
      input.quantity ?? null,
      input.totalEtb ?? null,
      JSON.stringify(input.payload),
      Date.now(),
    ]
  );
}

export async function evictTicket(reference: string): Promise<void> {
  if (!isSqliteAvailable()) return;
  const db = await getDb();
  await db.runAsync(`DELETE FROM ${CACHE_TABLE} WHERE reference = ?`, [reference]);
}

export async function evictAllTickets(): Promise<void> {
  if (!isSqliteAvailable()) return;
  const db = await getDb();
  await db.runAsync(`DELETE FROM ${CACHE_TABLE}`);
}

export async function readCachedTicket(reference: string): Promise<CachedTicket | null> {
  if (!isSqliteAvailable()) return null;
  const db = await getDb();
  const row = await db.getFirstAsync<{
    reference: string;
    booking_id: string;
    status: string;
    visit_date: string;
    category_name_en: string | null;
    category_name_am: string | null;
    quantity: number | null;
    total_etb: string | null;
    payload_json: string;
    synced_at: number;
  }>(`SELECT * FROM ${CACHE_TABLE} WHERE reference = ?`, [reference]);

  if (!row) return null;
  return {
    reference: row.reference,
    bookingId: row.booking_id,
    status: row.status,
    visitDate: row.visit_date,
    categoryNameEn: row.category_name_en,
    categoryNameAm: row.category_name_am,
    quantity: row.quantity,
    totalEtb: row.total_etb,
    payloadJson: row.payload_json,
    syncedAt: row.synced_at,
  };
}

export async function listCachedTickets(): Promise<CachedTicket[]> {
  if (!isSqliteAvailable()) return [];
  const db = await getDb();
  const rows = await db.getAllAsync<any>(
    `SELECT * FROM ${CACHE_TABLE} ORDER BY visit_date ASC`
  );
  return rows.map((row: any) => ({
    reference: row.reference,
    bookingId: row.booking_id,
    status: row.status,
    visitDate: row.visit_date,
    categoryNameEn: row.category_name_en,
    categoryNameAm: row.category_name_am,
    quantity: row.quantity,
    totalEtb: row.total_etb,
    payloadJson: row.payload_json,
    syncedAt: row.synced_at,
  }));
}

/**
 * Purge on app launch:
 * - rows older than CACHE_TTL_MS
 * - rows whose visit_date has already passed
 */
export async function purgeExpiredTickets(): Promise<void> {
  if (!isSqliteAvailable()) return;
  const db = await getDb();
  const cutoff = Date.now() - CACHE_TTL_MS;
  const today = new Date().toISOString().slice(0, 10);
  await db.runAsync(
    `DELETE FROM ${CACHE_TABLE} WHERE synced_at < ? OR visit_date < ?`,
    [cutoff, today]
  );
}
