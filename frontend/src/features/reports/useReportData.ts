'use client';

import { useEffect, useState } from 'react';

/**
 * Loads one report for the current range. Re-fetches whenever `key`
 * changes (the page passes `${from}|${to}`), ignores a stale response if
 * the key changed mid-flight, and exposes `loading`/`error` so each tab
 * can render its own skeleton / error / empty state.
 *
 * `loading` is *derived* (the stored result belongs to a different key)
 * rather than set synchronously inside the effect, so a range change
 * renders the skeleton immediately without a cascading re-render.
 */
export function useReportData<T>(fetcher: () => Promise<T>, key: string) {
  const [result, setResult] = useState<{ key: string; data: T | null; error: string | null } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetcher()
      .then((data) => {
        if (!cancelled) setResult({ key, data, error: null });
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setResult({ key, data: null, error: err instanceof Error ? err.message : 'Failed to load report' });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const current = result && result.key === key ? result : null;
  return {
    data: current?.data ?? null,
    error: current?.error ?? null,
    loading: current === null,
  };
}
