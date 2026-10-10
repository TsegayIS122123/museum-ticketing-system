import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const ACCESS_KEY = 'znhm.accessToken';
const REFRESH_KEY = 'znhm.refreshToken';

const isWeb = Platform.OS === 'web';

let memoryAccess: string | null = null;
let memoryRefresh: string | null = null;

async function nativeGet(key: string): Promise<string | null> {
  if (isWeb) return null;
  return SecureStore.getItemAsync(key);
}

async function nativeSet(key: string, value: string): Promise<void> {
  if (isWeb) return;
  await SecureStore.setItemAsync(key, value);
}

async function nativeDelete(key: string): Promise<void> {
  if (isWeb) return;
  await SecureStore.deleteItemAsync(key);
}

export async function getAccessToken(): Promise<string | null> {
  if (memoryAccess) return memoryAccess;
  memoryAccess = await nativeGet(ACCESS_KEY);
  return memoryAccess;
}

export async function getRefreshToken(): Promise<string | null> {
  if (memoryRefresh) return memoryRefresh;
  memoryRefresh = await nativeGet(REFRESH_KEY);
  return memoryRefresh;
}

export async function setTokens(tokens: {
  accessToken: string;
  refreshToken: string;
}): Promise<void> {
  memoryAccess = tokens.accessToken;
  memoryRefresh = tokens.refreshToken;
  await nativeSet(ACCESS_KEY, tokens.accessToken);
  await nativeSet(REFRESH_KEY, tokens.refreshToken);
}

export async function clearTokens(): Promise<void> {
  memoryAccess = null;
  memoryRefresh = null;
  await nativeDelete(ACCESS_KEY);
  await nativeDelete(REFRESH_KEY);
}

/**
 * Exchange the refresh token for a new pair.
 * Uses the body-based refresh path for `X-Client-Platform: expo` (contract v0.2.0).
 */
export async function refreshAccessToken(): Promise<string | null> {
  const refresh = await getRefreshToken();
  if (!refresh) return null;
  try {
    const { API_BASE_URL } = await import('@/constants/config');
    const res = await fetch(`${API_BASE_URL}/auth/refresh/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Client-Platform': 'expo',
      },
      body: JSON.stringify({ refresh_token: refresh }),
    });
    if (!res.ok) {
      await clearTokens();
      return null;
    }
    // `POST /auth/refresh/` returns `access` (+ `refresh_token` for expo
    // clients), unlike the login/OTP bodies which use `access_token` -- see
    // CookieTokenRefreshView in backend/apps/accounts/views.py.
    const data = await res.json();
    await setTokens({
      accessToken: data.access,
      refreshToken: data.refresh_token ?? refresh,
    });
    return data.access;
  } catch {
    await clearTokens();
    return null;
  }
}
