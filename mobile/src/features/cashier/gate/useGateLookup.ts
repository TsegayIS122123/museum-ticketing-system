import { useCallback, useState } from 'react';
import { lookupBooking, type GateBooking } from '@/api/queries/gate';
import { isApiError } from '@/api/errors';

export type GateLookupState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'found'; booking: GateBooking }
  | { kind: 'not-found'; reference: string }
  | { kind: 'error'; message: string };

export function useGateLookup() {
  const [state, setState] = useState<GateLookupState>({ kind: 'idle' });

  const lookup = useCallback(async (reference: string) => {
    const ref = reference.trim().toUpperCase();
    if (!ref) return;
    setState({ kind: 'loading' });
    try {
      const booking = await lookupBooking(ref);
      setState({ kind: 'found', booking });
    } catch (err) {
      if (isApiError(err)) {
        // Backend returns 404 for unknown reference
        setState({ kind: 'not-found', reference: ref });
      } else {
        setState({
          kind: 'error',
          message: err instanceof Error ? err.message : 'Lookup failed',
        });
      }
    }
  }, []);

  const reset = useCallback(() => setState({ kind: 'idle' }), []);

  return { state, lookup, reset };
}
