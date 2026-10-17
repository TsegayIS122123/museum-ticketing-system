import * as WebBrowser from 'expo-web-browser';
import { Alert, Platform } from 'react-native';

import i18n from '@/i18n';

/**
 * The backend returns the Chapa checkout URL, but it reaches us through a
 * route param that a crafted `znhm://` deep link can control. Opening an
 * arbitrary URL in the trusted in-app browser is a phishing/card-theft
 * surface, so only https URLs on a Chapa host are allowed through.
 */
const ALLOWED_CHECKOUT_URL_RE = /^https:\/\/([a-z0-9-]+\.)*chapa\.co(?:[/?#]|$)/i;

function isAllowedCheckoutUrl(url: string): boolean {
  return ALLOWED_CHECKOUT_URL_RE.test(url.trim());
}

/**
 * Open the Chapa checkout URL in an in-app browser, then resolve once the
 * browser is closed by the user. The return URL the browser lands on is
 * intentionally ignored — the backend webhook is the only source of truth
 * (FR-PAY-002). The caller polls the booking status afterwards.
 */
export async function openChapaCheckout(checkoutUrl: string): Promise<void> {
  // Refuse anything that is not a Chapa https checkout URL.
  if (!isAllowedCheckoutUrl(checkoutUrl)) {
    Alert.alert(
      i18n.t('checkoutInvalidTitle', 'Unable to open checkout'),
      i18n.t(
        'checkoutInvalidBody',
        'This checkout link could not be verified. Please start the booking again or contact support.'
      )
    );
    return;
  }

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
