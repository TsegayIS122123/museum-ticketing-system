import { getDb, isSqliteAvailable } from './index';
import { SYNC_QUEUE_TABLE } from './schema';

export type SyncKind = 'check-in';
export type SyncStatus = 'pending' | 'syncing' | 'synced' | 'failed' | 'conflict';

export interface SyncItem {
  idempotencyKey: string;
  kind: SyncKind;
  payloadJson: string;
  status: SyncStatus;
  attempts: number;
  lastError: string | null;
  createdAt: number;
  lastAttemptAt: number | null;
}

export async function enqueue(input: {
  idempotencyKey: string;
  kind: SyncKind;
  payload: unknown;
}): Promise<void> {
  if (!isSqliteAvailable()) return;
  const db = await getDb();
  await db.runAsync(
    `INSERT OR REPLACE INTO ${SYNC_QUEUE_TABLE}
       (idempotency_key, kind, payload_json, status, attempts, created_at)
     VALUES (?, ?, ?, 'pending', 0, ?)`,
    [input.idempotencyKey, input.kind, JSON.stringify(input.payload), Date.now()]
  );
}

export async function listPending(limit = 25): Promise<SyncItem[]> {
  if (!isSqliteAvailable()) return [];
  const db = await getDb();
  const rows = await db.getAllAsync<any>(
    `SELECT * FROM ${SYNC_QUEUE_TABLE}
       WHERE status IN ('pending', 'failed')
       ORDER BY created_at ASC
       LIMIT ?`,
    [limit]
  );
  return rows.map(rowToItem);
}

export async function listAll(): Promise<SyncItem[]> {
  if (!isSqliteAvailable()) return [];
  const db = await getDb();
  const rows = await db.getAllAsync<any>(
    `SELECT * FROM ${SYNC_QUEUE_TABLE} ORDER BY created_at DESC`
  );
  return rows.map(rowToItem);
}

export async function markSyncing(key: string): Promise<void> {
  if (!isSqliteAvailable()) return;
  const db = await getDb();
  await db.runAsync(
    `UPDATE ${SYNC_QUEUE_TABLE}
       SET status = 'syncing', attempts = attempts + 1, last_attempt_at = ?
       WHERE idempotency_key = ?`,
    [Date.now(), key]
  );
}

export async function markSynced(key: string): Promise<void> {
  if (!isSqliteAvailable()) return;
  const db = await getDb();
  await db.runAsync(
    `UPDATE ${SYNC_QUEUE_TABLE} SET status = 'synced', last_error = NULL WHERE idempotency_key = ?`,
    [key]
  );
}

export async function markFailed(key: string, error: string): Promise<void> {
  if (!isSqliteAvailable()) return;
  const db = await getDb();
  await db.runAsync(
    `UPDATE ${SYNC_QUEUE_TABLE} SET status = 'failed', last_error = ? WHERE idempotency_key = ?`,
    [error, key]
  );
}

export async function markConflict(key: string, reason: string): Promise<void> {
  if (!isSqliteAvailable()) return;
  const db = await getDb();
  await db.runAsync(
    `UPDATE ${SYNC_QUEUE_TABLE} SET status = 'conflict', last_error = ? WHERE idempotency_key = ?`,
    [reason, key]
  );
}

export async function pendingCount(): Promise<number> {
  if (!isSqliteAvailable()) return 0;
  const db = await getDb();
  const row = await db.getFirstAsync<{ c: number }>(
    `SELECT COUNT(*) as c FROM ${SYNC_QUEUE_TABLE}
       WHERE status IN ('pending', 'failed', 'conflict')`
  );
  return row?.c ?? 0;
}

export async function clearSynced(): Promise<void> {
  if (!isSqliteAvailable()) return;
  const db = await getDb();
  await db.runAsync(`DELETE FROM ${SYNC_QUEUE_TABLE} WHERE status = 'synced'`);
}

function rowToItem(row: any): SyncItem {
  return {
    idempotencyKey: row.idempotency_key,
    kind: row.kind,
    payloadJson: row.payload_json,
    status: row.status,
    attempts: row.attempts,
    lastError: row.last_error,
    createdAt: row.created_at,
    lastAttemptAt: row.last_attempt_at,
  };
}
