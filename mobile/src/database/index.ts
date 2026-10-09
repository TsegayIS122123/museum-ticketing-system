import * as SQLite from 'expo-sqlite';
import { Platform } from 'react-native';
import { CREATE_CACHE_TABLE, CREATE_INDEX_STATUS } from './schema';

const DB_NAME = 'znhm.db';

let db: SQLite.SQLiteDatabase | null = null;
let initPromise: Promise<SQLite.SQLiteDatabase> | null = null;

/**
 * Lazily open and migrate the SQLite database.
 *
 * On web, expo-sqlite is a no-op shim (uses IndexedDB under the hood in
 * dev builds; in some setups it throws). We guard the whole module so the
 * web preview still works — the offline cache is a mobile-only feature.
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
  await opened.execAsync(CREATE_CACHE_TABLE);
  await opened.execAsync(CREATE_INDEX_STATUS);
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
