/**
 * In-memory + AsyncStorage cache for discover_organizations RPC results.
 * Org-scoped keys; cleared on realtime invalidation or explicit refresh.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { DiscoverOrg } from '@/features/network/services/discover.service';

export const DISCOVERY_CACHE_TTL_MS = 30_000;
const PERSIST_KEY = '@q/discover-cache/v1';
const MAX_ENTRIES_PER_ORG = 24;

export type DiscoveryCacheEntry = {
  data: DiscoverOrg[];
  timestamp: number;
};

type PersistedPayload = {
  version: 1;
  byOrg: Record<string, Record<string, DiscoveryCacheEntry>>;
};

const memoryByOrg = new Map<string, Map<string, DiscoveryCacheEntry>>();

export function discoveryCacheKey(orgId: string, search: string): string {
  return `${orgId}::${search.toLowerCase().trim()}`;
}

function orgMap(orgId: string): Map<string, DiscoveryCacheEntry> {
  let map = memoryByOrg.get(orgId);
  if (!map) {
    map = new Map();
    memoryByOrg.set(orgId, map);
  }
  return map;
}

export function getDiscoveryCache(
  orgId: string,
  search: string,
): DiscoveryCacheEntry | null {
  const entry = orgMap(orgId).get(discoveryCacheKey(orgId, search));
  if (!entry) return null;
  if (Date.now() - entry.timestamp > DISCOVERY_CACHE_TTL_MS) {
    orgMap(orgId).delete(discoveryCacheKey(orgId, search));
    return null;
  }
  return entry;
}

export function setDiscoveryCache(
  orgId: string,
  search: string,
  data: DiscoverOrg[],
): void {
  const map = orgMap(orgId);
  const key = discoveryCacheKey(orgId, search);
  map.set(key, { data, timestamp: Date.now() });
  if (map.size > MAX_ENTRIES_PER_ORG) {
    const oldest = [...map.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp);
    const drop = oldest.slice(0, map.size - MAX_ENTRIES_PER_ORG);
    for (const [k] of drop) map.delete(k);
  }
  void persistDiscoveryCache();
}

export function clearDiscoveryCache(orgId?: string): void {
  if (orgId) {
    memoryByOrg.delete(orgId);
  } else {
    memoryByOrg.clear();
  }
  void persistDiscoveryCache();
}

/** Stale-but-usable snapshot for offline fallback (ignores TTL). */
export function getDiscoveryCacheStale(
  orgId: string,
  search: string,
): DiscoveryCacheEntry | null {
  return orgMap(orgId).get(discoveryCacheKey(orgId, search)) ?? null;
}

export async function hydrateDiscoveryCacheFromStorage(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(PERSIST_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as PersistedPayload;
    if (parsed.version !== 1 || !parsed.byOrg) return;
    for (const [orgId, entries] of Object.entries(parsed.byOrg)) {
      const map = orgMap(orgId);
      for (const [key, entry] of Object.entries(entries)) {
        if (Array.isArray(entry.data) && typeof entry.timestamp === 'number') {
          map.set(key, entry);
        }
      }
    }
  } catch {
    /* ignore corrupt cache */
  }
}

async function persistDiscoveryCache(): Promise<void> {
  try {
    const byOrg: PersistedPayload['byOrg'] = {};
    memoryByOrg.forEach((map, orgId) => {
      byOrg[orgId] = Object.fromEntries(map.entries());
    });
    await AsyncStorage.setItem(
      PERSIST_KEY,
      JSON.stringify({ version: 1, byOrg } satisfies PersistedPayload),
    );
  } catch {
    /* storage full / unavailable */
  }
}
