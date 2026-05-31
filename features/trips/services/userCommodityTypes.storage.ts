/**
 * Per-user commodity labels (vehicle / product) stored locally on device.
 * Not synced to org or Supabase — private shortcuts for Create Trip & deploy flows.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

export type CommodityTypeKind = "vehicle" | "product";

export type UserCommodityTypesStore = {
  vehicleTypes: string[];
  productTypes: string[];
};

type PendingPick = {
  kind: CommodityTypeKind;
  name: string;
};

const STORE_KEY = (userId: string) => `q.userCommodityTypes.v1:${userId}`;
const PENDING_KEY = (userId: string) => `q.userCommodityTypes.pending.v1:${userId}`;

const EMPTY: UserCommodityTypesStore = { vehicleTypes: [], productTypes: [] };

function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, " ").slice(0, 64);
}

function dedupeNames(names: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of names) {
    const n = normalizeName(raw);
    if (!n) continue;
    const key = n.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(n);
  }
  return out;
}

export async function loadUserCommodityTypes(
  userId: string,
): Promise<UserCommodityTypesStore> {
  try {
    const raw = await AsyncStorage.getItem(STORE_KEY(userId));
    if (!raw) return { ...EMPTY };
    const parsed = JSON.parse(raw) as Partial<UserCommodityTypesStore>;
    return {
      vehicleTypes: dedupeNames(Array.isArray(parsed.vehicleTypes) ? parsed.vehicleTypes : []),
      productTypes: dedupeNames(Array.isArray(parsed.productTypes) ? parsed.productTypes : []),
    };
  } catch {
    return { ...EMPTY };
  }
}

async function persistStore(userId: string, store: UserCommodityTypesStore): Promise<void> {
  await AsyncStorage.setItem(STORE_KEY(userId), JSON.stringify(store));
}

export async function addUserCommodityType(
  userId: string,
  kind: CommodityTypeKind,
  name: string,
): Promise<{ store: UserCommodityTypesStore; added: string | null }> {
  const label = normalizeName(name);
  if (!label) return { store: await loadUserCommodityTypes(userId), added: null };
  const store = await loadUserCommodityTypes(userId);
  const listKey = kind === "vehicle" ? "vehicleTypes" : "productTypes";
  const next = dedupeNames([label, ...store[listKey]]);
  const updated = { ...store, [listKey]: next };
  await persistStore(userId, updated);
  return { store: updated, added: label };
}

export async function removeUserCommodityType(
  userId: string,
  kind: CommodityTypeKind,
  name: string,
): Promise<UserCommodityTypesStore> {
  const key = name.trim().toLowerCase();
  const store = await loadUserCommodityTypes(userId);
  const listKey = kind === "vehicle" ? "vehicleTypes" : "productTypes";
  const updated = {
    ...store,
    [listKey]: store[listKey].filter((n) => n.toLowerCase() !== key),
  };
  await persistStore(userId, updated);
  return updated;
}

export async function setPendingCommodityPick(
  userId: string,
  pick: PendingPick,
): Promise<void> {
  await AsyncStorage.setItem(PENDING_KEY(userId), JSON.stringify(pick));
}

export async function takePendingCommodityPick(
  userId: string,
): Promise<PendingPick | null> {
  try {
    const raw = await AsyncStorage.getItem(PENDING_KEY(userId));
    if (!raw) return null;
    await AsyncStorage.removeItem(PENDING_KEY(userId));
    const parsed = JSON.parse(raw) as PendingPick;
    if (
      (parsed.kind !== "vehicle" && parsed.kind !== "product") ||
      typeof parsed.name !== "string" ||
      !parsed.name.trim()
    ) {
      return null;
    }
    return { kind: parsed.kind, name: normalizeName(parsed.name) };
  } catch {
    return null;
  }
}
