import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { getPendingSyncCount } from './useOfflineSync';
import { useProcessSyncQueue } from './useOfflineSync';

interface SyncContextValue {
  pendingCount: number;
  isProcessing: boolean;
  lastResult: { ok: number; failed: number } | null;
  refresh: () => Promise<void>;
  process: () => Promise<void>;
}

const SyncContext = createContext<SyncContextValue | null>(null);

export function SyncProvider({ children }: { children: ReactNode }) {
  const { running, lastResult, process } = useProcessSyncQueue();
  const [pendingCount, setPendingCount] = useState(0);

  const refresh = useCallback(async () => {
    const n = await getPendingSyncCount();
    setPendingCount(n);
  }, []);

  // Periodic ping every 30s when app is foregrounded
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      refresh();
      timer = setInterval(async () => {
        await refresh();
        if (await getPendingSyncCount() > 0) {
          await process();
          await refresh();
        }
      }, 30_000);
    };

    const stop = () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    };

    start();

    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active') start();
      else stop();
    });

    return () => {
      stop();
      sub.remove();
    };
  }, [refresh, process]);

  return (
    <SyncContext.Provider
      value={{
        pendingCount,
        isProcessing: running,
        lastResult,
        refresh,
        process,
      }}
    >
      {children}
    </SyncContext.Provider>
  );
}

export function useSyncContext(): SyncContextValue {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error('useSyncContext must be used inside <SyncProvider>');
  return ctx;
}
