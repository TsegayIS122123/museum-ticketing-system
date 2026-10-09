import * as SQLite from 'expo-sqlite';
import { Platform } from 'react-native';
import {
  CREATE_CACHE_TABLE,
  CREATE_INDEX_STATUS,
  CREATE_CASHIER_BOOKINGS_TABLE,
  CREATE_CASHIER_BOOKINGS_REF_INDEX,
  CREATE_SYNC_QUEUE_TABLE,
  CREATE_SYNC_QUEUE_STATUS_INDEX,
} from './schema';

const DB_NAME = 'znhm.db';

let db: SQLite.SQLiteDatabase | null = null;
let initPromise: Promise<SQLite.SQLiteDatabase> | null = null;

/**
 * SQLite is not available on the web preview — expo-sqlite's web
 * implementation is partial. The offline cache and sync queue are
 * mobile-only features, so every caller guards on this.
 */
export function isSqliteAvailable(): boolean {
  return Platform.OS !== 'web';
}

async function open(): Promise<SQLite.SQLiteDatabase> {
  if (!isSqliteAvailable()) {
    throw new Error('SQLite is not available on web');
  }
  if (db) return db;

  const opened = await SQLite.openDatabaseAsync(DB_NAME);

  // Visitor ticket cache (offline vault)
  await opened.execAsync(CREATE_CACHE_TABLE);
  await opened.execAsync(CREATE_INDEX_STATUS);

  // Cashier offline tables (bookings cache + check-in queue)
  await opened.execAsync(CREATE_CASHIER_BOOKINGS_TABLE);
  await opened.execAsync(CREATE_CASHIER_BOOKINGS_REF_INDEX);
  await opened.execAsync(CREATE_SYNC_QUEUE_TABLE);
  await opened.execAsync(CREATE_SYNC_QUEUE_STATUS_INDEX);

  db = opened;
  return opened;
}

export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!initPromise) {
    initPromise = open();
  }
  return initPromise;
}

/** Called once at app start. Safe to call on web (no-op). */
export async function initDatabase(): Promise<void> {
  if (!isSqliteAvailable()) return;
  try {
    await getDb();
  } catch (err) {
    // Non-fatal: the cache is best-effort.
    // eslint-disable-next-line no-console
    console.warn('[database] failed to init SQLite:', err);
  }
}
