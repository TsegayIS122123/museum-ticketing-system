import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

/**
 * Open the Chapa checkout URL in an in-app browser, then resolve once the
 * browser is closed by the user. The return URL the browser lands on is
 * intentionally ignored — the backend webhook is the only source of truth
 * (FR-PAY-002). The caller polls the booking status afterwards.
 */
export async function openChapaCheckout(checkoutUrl: string): Promise<void> {
  const result = await WebBrowser.openBrowserAsync(checkoutUrl, {
    dismissButtonStyle: 'close',
    controlsColor: '#015484',
    // Web has no in-app browser; open in a new tab and resolve immediately.
    ...(Platform.OS === 'web'
      ? { showTitle: false, enableBarCollapsing: false }
      : {}),
  });

  // On native, `result.type` is 'opened' | 'cancel' | 'dismiss'.
  // In all cases, we simply fall through and let the caller start polling.
  void result;
}
