import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Reusable queue for personalization choices made before a session exists
 * (e.g. during email verification). Never silently discard — persist the
 * choice, apply it automatically once a session appears, retry once, then
 * clear only on success. Keyed by kind so future entries (workspace logo,
 * banner, theme) can be added without a new storage mechanism.
 */

const PENDING_PERSONALIZATION_KEY = '@pulse_pending_personalization_v1';

// Currently only preset avatar selections can exist before a session.
// Uploaded images require authentication before upload and therefore
// never enter this queue — don't assume `profile_photo` covers uploads too.
export interface PendingProfilePhotoEntry {
  kind: 'profile_photo';
  avatarSeed: string;
  retried: boolean;
}

export type PendingPersonalizationEntry = PendingProfilePhotoEntry;
export type PendingPersonalizationKind = PendingPersonalizationEntry['kind'];

type PendingPersonalizationStore = Partial<Record<PendingPersonalizationKind, PendingPersonalizationEntry>>;

async function readStore(): Promise<PendingPersonalizationStore> {
  try {
    const raw = await AsyncStorage.getItem(PENDING_PERSONALIZATION_KEY);
    return raw ? (JSON.parse(raw) as PendingPersonalizationStore) : {};
  } catch {
    return {};
  }
}

async function writeStore(store: PendingPersonalizationStore): Promise<void> {
  try {
    if (Object.keys(store).length === 0) {
      await AsyncStorage.removeItem(PENDING_PERSONALIZATION_KEY);
    } else {
      await AsyncStorage.setItem(PENDING_PERSONALIZATION_KEY, JSON.stringify(store));
    }
  } catch {
    // Non-fatal — worst case the pending choice is retried again next session.
  }
}

export async function setPendingPersonalization(entry: PendingPersonalizationEntry): Promise<void> {
  const store = await readStore();
  store[entry.kind] = entry;
  await writeStore(store);
}

export async function getPendingPersonalization(
  kind: PendingPersonalizationKind,
): Promise<PendingPersonalizationEntry | null> {
  const store = await readStore();
  return store[kind] ?? null;
}

export async function markPendingPersonalizationRetried(kind: PendingPersonalizationKind): Promise<void> {
  const store = await readStore();
  const entry = store[kind];
  if (!entry) return;
  store[kind] = { ...entry, retried: true };
  await writeStore(store);
}

export async function clearPendingPersonalization(kind: PendingPersonalizationKind): Promise<void> {
  const store = await readStore();
  delete store[kind];
  await writeStore(store);
}
