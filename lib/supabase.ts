/**
 * Supabase client for React Native (Expo).
 * Session persistence: expo-secure-store on iOS/Android when the native module
 * is available (e.g. dev/production build); falls back to AsyncStorage on web or
 * when ExpoSecureStore is not available (e.g. some Expo Go). Same DB as pulse-unified-base.
 * RLS applies; do not use service_role key in the app.
 *
 * CONNECTION MODEL — important:
 * The JS SDK communicates over HTTPS (REST API via PostgREST + Auth + Storage).
 * It never opens a raw Postgres wire connection (port 5432 / 6543).
 * Supavisor Transaction Mode (port 6543) is for pg-wire tools ONLY:
 *   psql, pgAdmin, db migrations, Node.js `pg` driver, Edge Functions using pg.
 * Do NOT point EXPO_PUBLIC_SUPABASE_URL at port 6543 — it will break all REST calls.
 *
 * SINGLETON — this file exports one client instance created at first call.
 * Never call createClient() again elsewhere; import supabase() from this module.
 */
import { createClient, processLock, type SupabaseClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { isRetryableHttpResponse } from '@/lib/supabaseHttp.util';

// Lazy-load SecureStore so we can fall back to AsyncStorage if native module is missing (Expo Go, etc.)
let SecureStore: typeof import('expo-secure-store') | null = null;
try {
  SecureStore = require('expo-secure-store');
} catch {
  if (__DEV__) console.warn('[auth] SecureStore unavailable, falling back to AsyncStorage');
  SecureStore = null;
}

const REQUEST_TIMEOUT_MS = 25_000;
const MAX_RETRIES = 3;   // 4 total attempts: initial + 3 retries
/** Exponential backoff: attempt 1 → 2s, attempt 2 → 4s */
function retryDelayMs(attempt: number): number {
  return Math.min(2_000 * Math.pow(2, attempt - 1), 8_000);
}

/** Fetch with timeout and one retry to cope with flaky home WiFi / DNS. */
async function fetchWithTimeoutAndRetry(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const doFetch = (signal?: AbortSignal) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const combinedSignal = signal
      ? abortSignalAny(controller.signal, signal)
      : controller.signal;
    const merged: RequestInit = {
      ...init,
      signal: combinedSignal,
    };
    return fetch(input, merged).finally(() => clearTimeout(timeoutId));
  };
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await doFetch(init?.signal ?? undefined);
      if (isRetryableHttpResponse(res) && attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, retryDelayMs(attempt)));
        continue;
      }
      return res;
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      const isRetryable =
        attempt < MAX_RETRIES &&
        (lastError.name === 'AbortError' ||
          lastError.message === 'Network request failed' ||
          lastError.message === 'Load failed' ||
          /timeout|network|failed|access control checks/i.test(lastError.message));
      if (!isRetryable) throw lastError;
      await new Promise((r) => setTimeout(r, retryDelayMs(attempt)));
    }
  }
  throw lastError ?? new Error('Network request failed');
}

/** Combine two AbortSignals so aborting either aborts the result. */
function abortSignalAny(...signals: AbortSignal[]): AbortSignal {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signals.forEach((s) => {
    if (s.aborted) abort();
    else s.addEventListener('abort', abort);
  });
  return controller.signal;
}

/** SecureStore byte limit (exceeding causes warnings / failure). Use AsyncStorage for larger values. */
const SECURE_STORE_MAX_BYTES = 2048;

function byteLength(str: string): number {
  if (typeof Buffer !== 'undefined') return Buffer.byteLength(str, 'utf8');
  try {
    return new TextEncoder().encode(str).length;
  } catch {
    return str.length * 2;
  }
}

/** Auth storage: SecureStore when value ≤2KB; else AsyncStorage. No in-memory state so session survives Metro reload. */
function createAuthStorage(): {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
} {
  if (Platform.OS === 'web') {
    return AsyncStorage;
  }
  if (!SecureStore) {
    return AsyncStorage;
  }

  let useAsyncStorageForAll = false;

  return {
    getItem: async (key: string) => {
      if (useAsyncStorageForAll) return AsyncStorage.getItem(key);

      try {
        const secureValue = await SecureStore!.getItemAsync(key);
        if (secureValue !== null) return secureValue;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (/native module|ExpoSecureStore|not found/i.test(msg)) {
          useAsyncStorageForAll = true;
        } else if (__DEV__) {
          console.warn('[pulse] SecureStore read error:', msg);
        }
      }

      return AsyncStorage.getItem(key);
    },

    setItem: async (key: string, value: string) => {
      if (useAsyncStorageForAll) return AsyncStorage.setItem(key, value);

      if (byteLength(value) > SECURE_STORE_MAX_BYTES) {
        await SecureStore!.deleteItemAsync(key).catch(() => {});
        return AsyncStorage.setItem(key, value);
      }

      try {
        await AsyncStorage.removeItem(key).catch(() => {});
        return await SecureStore!.setItemAsync(key, value);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (/native module|ExpoSecureStore|not found/i.test(msg)) {
          useAsyncStorageForAll = true;
          return AsyncStorage.setItem(key, value);
        }
        throw e;
      }
    },

    removeItem: async (key: string) => {
      if (!useAsyncStorageForAll) {
        await SecureStore!.deleteItemAsync(key).catch(() => {});
      }
      await AsyncStorage.removeItem(key).catch(() => {});
    },
  };
}

const extra = Constants.expoConfig?.extra as {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
} | undefined;

// Prefer runtime-injected public env vars first (especially on web), then Expo extra.
// This avoids stale Expo extra manifests when Metro/browser cache lags behind .env edits.
function pickNonEmpty(...values: (string | undefined)[]): string | undefined {
  for (const v of values) {
    const s = typeof v === 'string' ? v.trim() : '';
    if (s) return s;
  }
  return undefined;
}
const envSupabaseUrl = pickNonEmpty(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.VITE_SUPABASE_URL);
const envSupabaseAnonKey = pickNonEmpty(
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  process.env.VITE_SUPABASE_ANON_KEY
);
const extraSupabaseUrl = pickNonEmpty(extra?.supabaseUrl);
const extraSupabaseAnonKey = pickNonEmpty(extra?.supabaseAnonKey);

const supabaseUrl = pickNonEmpty(envSupabaseUrl, extraSupabaseUrl);
const supabaseAnonKey = pickNonEmpty(envSupabaseAnonKey, extraSupabaseAnonKey);

/** Use before any Supabase call to show a config screen instead of throwing or failing network. */
export function hasSupabaseConfig(): boolean {
  return Boolean(supabaseUrl && supabaseAnonKey);
}

/** Base URL for the Supabase project (same as used by the client). Use for building Edge Function URLs. */
export function getSupabaseBaseUrl(): string | undefined {
  return supabaseUrl ?? undefined;
}

/** Anon key for the Supabase project. Use for Edge Function Authorization header so the gateway accepts the request; send user JWT in X-User-Token. */
export function getSupabaseAnonKey(): string | undefined {
  return supabaseAnonKey ?? undefined;
}

/** Fresh user access token for API/proxy calls. Call before each request that requires auth. Returns null if no session (user not signed in). */
export async function getAccessToken(): Promise<string | null> {
  // getSession() returns the locally cached token and triggers a background refresh
  // when it's near expiry (autoRefreshToken: true handles this). getUser() fires a
  // network request to /auth/v1/user on every call — unnecessary and adds Auth spike.
  const { data } = await supabase().auth.getSession();
  return data.session?.access_token ?? null;
}

export const SUPABASE_CONFIG_MISSING_MESSAGE =
  'Missing Supabase config. Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to .env in the project root, then restart: npx expo start';

function getSupabase(): SupabaseClient {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(SUPABASE_CONFIG_MISSING_MESSAGE);
  }
  if (__DEV__) {
    try {
      const host = new URL(supabaseUrl).hostname;
      console.log('[pulse] Supabase config marker:', '2026-05-08-extra-only-v2');
      console.log('[pulse] Supabase URL source (env):', envSupabaseUrl ?? '(missing)');
      console.log('[pulse] Supabase URL source (extra):', supabaseUrl);
      console.log('[pulse] Supabase URL host:', host);
      if (envSupabaseUrl && extraSupabaseUrl && envSupabaseUrl !== extraSupabaseUrl) {
        console.warn('[pulse] Supabase source mismatch: preferring env over extra', {
          envSupabaseUrl,
          extraSupabaseUrl,
        });
      }
    } catch {
      console.warn('[pulse] Supabase URL invalid:', supabaseUrl?.slice(0, 50));
    }
  }
  // SecureStore when available (native build); else AsyncStorage (web or Expo Go without native module)
  const authStorage = createAuthStorage();


  const c = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      storage: authStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      // Navigator Web Locks are browser-only; on native they surface as uncaught
      // "Lock was stolen by another request" when auth refreshes overlap.
      ...(Platform.OS !== 'web' ? { lock: processLock } : {}),
    },
    global: {
      fetch: fetchWithTimeoutAndRetry,
    },
    realtime: {
      // Heartbeat every 30s (default 15s) — halves keepalive traffic on mobile connections.
      // 30s is well within the 60s server-side idle timeout for Supabase Realtime.
      heartbeatIntervalMs: 30_000,
      // Reconnect after 250ms, 500ms, 1s, 2s, 4s, 8s, 16s (exponential, capped at 30s).
      // Default starts at 1s which is fine; we push it slightly faster at the start.
      reconnectAfterMs: (tries: number) =>
        Math.min(250 * Math.pow(2, tries), 30_000),
    },
  });

  // Auth error recovery is handled entirely by AuthContext.onAuthStateChange.
  // A global TOKEN_REFRESHED handler here would race with AuthContext and cause
  // spurious sign-outs during normal token refresh cycles.

  return c;
}

let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  if (!client) {
    client = getSupabase();
  }
  return client;
}

export type { SupabaseClient };
