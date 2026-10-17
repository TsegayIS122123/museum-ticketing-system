import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

// django-allauth's app client is token-based: the signup response mints a
// short-lived `meta.session_token` that the client must echo back
// (X-Session-Token) to continue the pending verification flow (verify /
// resend). It only needs to survive the register -> verify-email hop, so a
// small dedicated store (SecureStore on device, in-memory on web) is enough --
// it is cleared as soon as verification succeeds.
const SESSION_KEY = 'znhm.headless.sessionToken';
const EMAIL_KEY = 'znhm.headless.email';

const isWeb = Platform.OS === 'web';

export interface HeadlessSessionState {
  sessionToken: string;
  email?: string;
}

let memory: HeadlessSessionState | null | undefined;

async function getItem(key: string): Promise<string | null> {
  if (isWeb) return null;
  return SecureStore.getItemAsync(key);
}

async function setItem(key: string, value: string): Promise<void> {
  if (isWeb) return;
  await SecureStore.setItemAsync(key, value);
}

async function deleteItems(keys: string[]): Promise<void> {
  if (isWeb) return;
  await Promise.all(keys.map((k) => SecureStore.deleteItemAsync(k)));
}

export async function rememberHeadlessSession(
  state: HeadlessSessionState
): Promise<void> {
  memory = state;
  await setItem(SESSION_KEY, state.sessionToken);
  if (state.email) {
    await setItem(EMAIL_KEY, state.email);
  }
}

export async function readHeadlessSession(): Promise<HeadlessSessionState | null> {
  if (memory !== undefined) return memory;
  const sessionToken = await getItem(SESSION_KEY);
  if (!sessionToken) {
    memory = null;
    return null;
  }
  const email = (await getItem(EMAIL_KEY)) ?? undefined;
  memory = { sessionToken, email };
  return memory;
}

export async function clearHeadlessSession(): Promise<void> {
  memory = null;
  await deleteItems([SESSION_KEY, EMAIL_KEY]);
}
