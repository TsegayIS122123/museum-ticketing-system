import { getDb, isSqliteAvailable } from './index';
import { CASHIER_BOOKINGS_TABLE } from './schema';

export interface CachedCashierBooking {
  bookingId: string;
  reference: string;
  status: string;
  visitDate: string;
  bookingType: string | null;
  groupName: string | null;
  bookedQuantity: number | null;
  itemsJson: string | null;
  totalEtb: string | null;
  downloadedAt: number;
}

export async function upsertCashierBookings(
  bookings: Array<Omit<CachedCashierBooking, 'downloadedAt'>>
): Promise<void> {
  if (!isSqliteAvailable()) return;
  const db = await getDb();
  const now = Date.now();
  for (const b of bookings) {
    await db.runAsync(
      `INSERT INTO ${CASHIER_BOOKINGS_TABLE}
         (booking_id, reference, status, visit_date, booking_type, group_name,
          booked_quantity, items_json, total_etb, downloaded_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(booking_id) DO UPDATE SET
         reference = excluded.reference,
         status = excluded.status,
         visit_date = excluded.visit_date,
         booking_type = excluded.booking_type,
         group_name = excluded.group_name,
         booked_quantity = excluded.booked_quantity,
         items_json = excluded.items_json,
         total_etb = excluded.total_etb,
         downloaded_at = excluded.downloaded_at`,
      [
        b.bookingId,
        b.reference,
        b.status,
        b.visitDate,
        b.bookingType,
        b.groupName,
        b.bookedQuantity,
        b.itemsJson,
        b.totalEtb,
        now,
      ]
    );
  }
}

export async function findByReference(
  reference: string
): Promise<CachedCashierBooking | null> {
  if (!isSqliteAvailable()) return null;
  const db = await getDb();
  const row = await db.getFirstAsync<any>(
    `SELECT * FROM ${CASHIER_BOOKINGS_TABLE} WHERE reference = ?`,
    [reference]
  );
  if (!row) return null;
  return rowToBooking(row);
}

export async function listCachedBookings(): Promise<CachedCashierBooking[]> {
  if (!isSqliteAvailable()) return [];
  const db = await getDb();
  const rows = await db.getAllAsync<any>(
    `SELECT * FROM ${CASHIER_BOOKINGS_TABLE} ORDER BY visit_date ASC`
  );
  return rows.map(rowToBooking);
}

export async function clearCashierBookings(): Promise<void> {
  if (!isSqliteAvailable()) return;
  const db = await getDb();
  await db.runAsync(`DELETE FROM ${CASHIER_BOOKINGS_TABLE}`);
}

function rowToBooking(row: any): CachedCashierBooking {
  return {
    bookingId: row.booking_id,
    reference: row.reference,
    status: row.status,
    visitDate: row.visit_date,
    bookingType: row.booking_type,
    groupName: row.group_name,
    bookedQuantity: row.booked_quantity,
    itemsJson: row.items_json,
    totalEtb: row.total_etb,
    downloadedAt: row.downloaded_at,
  };
}
