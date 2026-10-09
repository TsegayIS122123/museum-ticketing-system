import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

/**
 * Minimal offline detection.
 *
 * Uses `navigator.onLine` on web. On native, the react-native community's
 * NetInfo package would be the full solution but requires an extra install;
 * for now, we treat the app as online (native rarely loses connectivity
 * at the museum) and rely on network errors to surface real problems.
 */
export function useOffline(): boolean {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (typeof window === 'undefined') return;

    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  return offline;
}
