/**
 * Suite navigation intent — handoff from Pulse Identity to product apps.
 * Single source of truth for post-auth destination (product + returnTo).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

import { normalizeSuiteReturnTo } from './suitePaths';
import type { SuiteProductId } from './suiteProducts';

export const SUITE_NAVIGATION_INTENT_VERSION = 1;
/** Browser OAuth round-trips should finish within this window. */
export const SUITE_NAVIGATION_INTENT_TTL_MS = 5 * 60 * 1000;

const STORAGE_KEY = '@pulse_suite_navigation_intent_v1';
/** Legacy key from early suite-auth prototype — read once for migration. */
const LEGACY_STORAGE_KEY = '@pulse_pending_suite_auth_redirect_v1';

export type SuiteNavigationIntent = {
  version: number;
  productId: SuiteProductId | null;
  returnTo: string;
  createdAt: number;
  consumed: boolean;
};

type LegacyPendingRedirect = {
  productId?: SuiteProductId | null;
  returnTo?: string;
  savedAt?: number;
};

function readSessionStorage(key: string): string | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || !window.sessionStorage) {
    return null;
  }
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeSessionStorage(key: string, value: string): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || !window.sessionStorage) {
    return false;
  }
  try {
    window.sessionStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function removeSessionStorage(key: string): void {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || !window.sessionStorage) {
    return;
  }
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // ignore
  }
}

async function readRawIntent(): Promise<string | null> {
  const fromSession = readSessionStorage(STORAGE_KEY);
  if (fromSession) return fromSession;

  const legacySession = readSessionStorage(LEGACY_STORAGE_KEY);
  if (legacySession) return legacySession;

  try {
    const fromAsync = await AsyncStorage.getItem(STORAGE_KEY);
    if (fromAsync) return fromAsync;
    return await AsyncStorage.getItem(LEGACY_STORAGE_KEY);
  } catch {
    return null;
  }
}

function normalizeIntentRecord(raw: unknown): SuiteNavigationIntent | null {
  if (!raw || typeof raw !== 'object') return null;

  const record = raw as Partial<SuiteNavigationIntent & LegacyPendingRedirect>;
  const returnTo = record.returnTo?.trim();
  if (!returnTo) return null;

  const createdAt =
    typeof record.createdAt === 'number'
      ? record.createdAt
      : typeof record.savedAt === 'number'
        ? record.savedAt
        : Date.now();

  if (Date.now() - createdAt > SUITE_NAVIGATION_INTENT_TTL_MS) {
    return null;
  }

  if (record.consumed === true) {
    return null;
  }

  return {
    version:
      typeof record.version === 'number' ? record.version : SUITE_NAVIGATION_INTENT_VERSION,
    productId: record.productId ?? null,
    returnTo: normalizeSuiteReturnTo(returnTo),
    createdAt,
    consumed: false,
  };
}

function parseIntent(raw: string | null): SuiteNavigationIntent | null {
  if (!raw) return null;
  try {
    return normalizeIntentRecord(JSON.parse(raw));
  } catch {
    return null;
  }
}

async function persistIntent(intent: SuiteNavigationIntent): Promise<void> {
  const raw = JSON.stringify(intent);
  if (!writeSessionStorage(STORAGE_KEY, raw)) {
    await AsyncStorage.setItem(STORAGE_KEY, raw).catch(() => {});
  }
  removeSessionStorage(LEGACY_STORAGE_KEY);
  await AsyncStorage.removeItem(LEGACY_STORAGE_KEY).catch(() => {});
}

/** Write (or replace) the active suite navigation intent before Identity redirect. */
export function writeSuiteNavigationIntent(payload: {
  productId: SuiteProductId | null;
  returnTo: string;
}): void {
  const intent: SuiteNavigationIntent = {
    version: SUITE_NAVIGATION_INTENT_VERSION,
    productId: payload.productId,
    returnTo: normalizeSuiteReturnTo(payload.returnTo),
    createdAt: Date.now(),
    consumed: false,
  };
  void persistIntent(intent);
}

export function peekSuiteNavigationIntentSync(): SuiteNavigationIntent | null {
  return parseIntent(readSessionStorage(STORAGE_KEY) ?? readSessionStorage(LEGACY_STORAGE_KEY));
}

export async function peekSuiteNavigationIntent(): Promise<SuiteNavigationIntent | null> {
  const raw = await readRawIntent();
  return parseIntent(raw);
}

/** Mark intent consumed without deleting — blocks duplicate consumption races. */
export async function markSuiteNavigationIntentConsumed(): Promise<void> {
  const intent = peekSuiteNavigationIntentSync() ?? (await peekSuiteNavigationIntent());
  if (!intent) {
    await clearSuiteNavigationIntent();
    return;
  }
  await persistIntent({ ...intent, consumed: true });
}

export async function clearSuiteNavigationIntent(): Promise<void> {
  removeSessionStorage(STORAGE_KEY);
  removeSessionStorage(LEGACY_STORAGE_KEY);
  await AsyncStorage.multiRemove([STORAGE_KEY, LEGACY_STORAGE_KEY]).catch(() => {});
}

/**
 * Single-consumption read: returns the intent and marks it consumed.
 * Callers navigate, then may clear storage via {@link clearSuiteNavigationIntent}.
 */
export async function consumeSuiteNavigationIntent(): Promise<SuiteNavigationIntent | null> {
  const intent = peekSuiteNavigationIntentSync() ?? (await peekSuiteNavigationIntent());
  if (!intent) return null;
  await markSuiteNavigationIntentConsumed();
  return intent;
}
