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
