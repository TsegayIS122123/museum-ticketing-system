import { useCallback, useState } from 'react';
import {
  enqueue,
  markConflict,
  markFailed,
  markSynced,
  markSyncing,
  listPending,
  pendingCount,
  clearSynced,
} from '@/database/sync-queue';
import { syncCheckIn, type SyncCheckInPayload } from '@/api/queries/offline-sync';
import { isApiError } from '@/api/errors';

/** Enqueue a check-in for later sync. Called from the offline check-in path. */
export function useEnqueueCheckIn() {
  return useCallback(
    async (input: {
      bookingId: string;
      reference: string;
      attendedQuantity: number;
    }) => {
      const idempotencyKey = `${input.bookingId}-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}`;
      const payload: SyncCheckInPayload = {
        idempotencyKey,
        bookingId: input.bookingId,
        reference: input.reference,
        attendedQuantity: input.attendedQuantity,
        occurredAt: new Date().toISOString(),
      };
      await enqueue({ idempotencyKey, kind: 'check-in', payload });
      return idempotencyKey;
    },
    []
  );
}

/** Process the queue: send every pending item, update its status. */
export function useProcessSyncQueue() {
  const [running, setRunning] = useState(false);
  const [lastResult, setLastResult] = useState<{ ok: number; failed: number } | null>(null);

  const process = useCallback(async () => {
    if (running) return;
    setRunning(true);
    let ok = 0;
    let failed = 0;
    try {
      const items = await listPending(25);
      for (const item of items) {
        await markSyncing(item.idempotencyKey);
        try {
          const payload = JSON.parse(item.payloadJson) as SyncCheckInPayload;
          const res = await syncCheckIn(payload);
          if (res.status === 'accepted') {
            await markSynced(item.idempotencyKey);
            ok += 1;
          } else if (res.status === 'conflict') {
            await markConflict(item.idempotencyKey, res.reason ?? 'Conflict');
            failed += 1;
          } else {
            await markFailed(item.idempotencyKey, res.reason ?? 'Rejected');
            failed += 1;
          }
        } catch (err) {
          const msg = isApiError(err) ? err.message : 'Network error';
          await markFailed(item.idempotencyKey, msg);
          failed += 1;
        }
      }
      await clearSynced();
      setLastResult({ ok, failed });
    } finally {
      setRunning(false);
    }
  }, [running]);

  return { running, lastResult, process };
}

/** Read the number of items still waiting to sync. */
export async function getPendingSyncCount(): Promise<number> {
  return pendingCount();
}
