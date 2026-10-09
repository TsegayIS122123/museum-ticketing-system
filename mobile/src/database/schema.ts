/**
 * Offline ticket cache schema.
 *
 * Only one entity is cached: the Visitor's own `pending` booking (the only
 * artifact they could ever be holding while offline). No staff-facing data
 * is cached, no writes are queued, and no gate validation reads from here.
 */
export const CACHE_TABLE = 'cached_ticket';

export const CREATE_CACHE_TABLE = `
  CREATE TABLE IF NOT EXISTS ${CACHE_TABLE} (
    reference        TEXT PRIMARY KEY,
    booking_id       TEXT NOT NULL,
    status           TEXT NOT NULL,
    visit_date       TEXT NOT NULL,
    category_name_en TEXT,
    category_name_am TEXT,
    quantity         INTEGER,
    total_etb        TEXT,
    payload_json     TEXT NOT NULL,
    synced_at        INTEGER NOT NULL
  );
`;

export const CREATE_INDEX_STATUS = `
  CREATE INDEX IF NOT EXISTS idx_cached_ticket_status
  ON ${CACHE_TABLE} (status);
`;

/** Rows older than this are purged on app launch. */
export const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/* ---------------------------------------------------------------------------
 * Phase 8: offline cashier tables
 * -------------------------------------------------------------------------*/

/** Cashier-downloaded bookings (authorized for the current shift). */
export const CASHIER_BOOKINGS_TABLE = 'cashier_bookings';

export const CREATE_CASHIER_BOOKINGS_TABLE = `
  CREATE TABLE IF NOT EXISTS ${CASHIER_BOOKINGS_TABLE} (
    booking_id       TEXT PRIMARY KEY,
    reference        TEXT NOT NULL,
    status           TEXT NOT NULL,
    visit_date       TEXT NOT NULL,
    booking_type     TEXT,
    group_name       TEXT,
    booked_quantity  INTEGER,
    items_json       TEXT,
    total_etb        TEXT,
    downloaded_at    INTEGER NOT NULL
  );
`;

export const CREATE_CASHIER_BOOKINGS_REF_INDEX = `
  CREATE INDEX IF NOT EXISTS idx_cashier_bookings_ref
  ON ${CASHIER_BOOKINGS_TABLE} (reference);
`;

/** Offline check-in queue — each row is one pending check-in to sync. */
export const SYNC_QUEUE_TABLE = 'sync_queue';

export const CREATE_SYNC_QUEUE_TABLE = `
  CREATE TABLE IF NOT EXISTS ${SYNC_QUEUE_TABLE} (
    idempotency_key  TEXT PRIMARY KEY,
    kind             TEXT NOT NULL,
    payload_json     TEXT NOT NULL,
    status           TEXT NOT NULL DEFAULT 'pending',
    attempts         INTEGER NOT NULL DEFAULT 0,
    last_error       TEXT,
    created_at       INTEGER NOT NULL,
    last_attempt_at  INTEGER
  );
`;

export const CREATE_SYNC_QUEUE_STATUS_INDEX = `
  CREATE INDEX IF NOT EXISTS idx_sync_queue_status
  ON ${SYNC_QUEUE_TABLE} (status);
`;
