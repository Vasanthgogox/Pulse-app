/**
 * Per-org monthly sales targets for the Network hub Goals tab (client-side persistence).
 *
 * Targets are keyed by month (YYYY-MM). Each month can hold org aggregate targets
 * (revenue, trip count, margin %) plus per-client / per-vehicle / per-driver targets.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

export type GoalFocus = "client" | "vehicle" | "driver";

/** Revenue (INR), trip count, and margin % (0–100, aggregate only). */
export type SalesTargetMetrics = {
  revenueInr: number;
  tripCount: number;
  marginPct: number;
};

export type EntityTargetMetrics = {
  revenueInr: number;
  tripCount: number;
};

export type NetworkGoalsMonthStore = {
  aggregate: SalesTargetMetrics;
  clients: Record<string, EntityTargetMetrics>;
  vehicles: Record<string, EntityTargetMetrics>;
  drivers: Record<string, EntityTargetMetrics>;
};

export type NetworkGoalsStore = {
  version: 2;
  months: Record<string, NetworkGoalsMonthStore>;
  updatedAt: string;
};

export const EMPTY_SALES_TARGET: SalesTargetMetrics = {
  revenueInr: 0,
  tripCount: 0,
  marginPct: 0,
};

export const EMPTY_ENTITY_TARGET: EntityTargetMetrics = {
  revenueInr: 0,
  tripCount: 0,
};

export const DEFAULT_NETWORK_GOALS_STORE: NetworkGoalsStore = {
  version: 2,
  months: {},
  updatedAt: "",
};

const STORAGE_KEY_V2 = (orgId: string) => `network-hub-goals:v2:${orgId}`;
const STORAGE_KEY_V1 = (orgId: string) => `network-hub-goals:v1:${orgId}`;

function emptyMonthStore(): NetworkGoalsMonthStore {
  return {
    aggregate: { ...EMPTY_SALES_TARGET },
    clients: {},
    vehicles: {},
    drivers: {},
  };
}

function safeMetrics(raw: Partial<SalesTargetMetrics> | undefined): SalesTargetMetrics {
  return {
    revenueInr: Math.max(0, Number(raw?.revenueInr) || 0),
    tripCount: Math.max(0, Math.round(Number(raw?.tripCount) || 0)),
    marginPct: Math.min(100, Math.max(0, Number(raw?.marginPct) || 0)),
  };
}

function safeEntity(raw: Partial<EntityTargetMetrics> | undefined): EntityTargetMetrics {
  return {
    revenueInr: Math.max(0, Number(raw?.revenueInr) || 0),
    tripCount: Math.max(0, Math.round(Number(raw?.tripCount) || 0)),
  };
}

function parseMonthStore(raw: unknown): NetworkGoalsMonthStore {
  const obj = (raw ?? {}) as Partial<NetworkGoalsMonthStore>;
  const clients: Record<string, EntityTargetMetrics> = {};
  const vehicles: Record<string, EntityTargetMetrics> = {};
  const drivers: Record<string, EntityTargetMetrics> = {};

  for (const [id, val] of Object.entries(obj.clients ?? {})) {
    clients[id] = safeEntity(val as Partial<EntityTargetMetrics>);
  }
  for (const [id, val] of Object.entries(obj.vehicles ?? {})) {
    vehicles[id] = safeEntity(val as Partial<EntityTargetMetrics>);
  }
  for (const [id, val] of Object.entries(obj.drivers ?? {})) {
    drivers[id] = safeEntity(val as Partial<EntityTargetMetrics>);
  }

  return {
    aggregate: safeMetrics(obj.aggregate),
    clients,
    vehicles,
    drivers,
  };
}

/** Previous calendar month key, or null if invalid. */
export function previousMonthKey(monthKey: string): string | null {
  const [y, m] = monthKey.split("-").map(Number);
  if (!y || !m) return null;
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function monthLabelFromKey(monthKey: string): string {
  const MONTH_SHORT = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ] as const;
  const [y, m] = monthKey.split("-");
  const idx = parseInt(m, 10) - 1;
  return `${MONTH_SHORT[idx] ?? m} '${y?.slice(2) ?? ""}`;
}

export function getMonthStore(
  store: NetworkGoalsStore,
  monthKey: string,
): NetworkGoalsMonthStore {
  return store.months[monthKey] ?? emptyMonthStore();
}

export function patchAggregateTarget(
  store: NetworkGoalsStore,
  monthKey: string,
  patch: Partial<SalesTargetMetrics>,
): NetworkGoalsStore {
  const current = getMonthStore(store, monthKey);
  return {
    ...store,
    months: {
      ...store.months,
      [monthKey]: {
        ...current,
        aggregate: safeMetrics({ ...current.aggregate, ...patch }),
      },
    },
  };
}

export function patchEntityTarget(
  store: NetworkGoalsStore,
  monthKey: string,
  focus: GoalFocus,
  entityId: string,
  patch: Partial<EntityTargetMetrics>,
): NetworkGoalsStore {
  const current = getMonthStore(store, monthKey);
  const bucket =
    focus === "client"
      ? current.clients
      : focus === "vehicle"
        ? current.vehicles
        : current.drivers;
  const prev = bucket[entityId] ?? { ...EMPTY_ENTITY_TARGET };
  const nextEntity = safeEntity({ ...prev, ...patch });
  const nextBucket = { ...bucket, [entityId]: nextEntity };

  return {
    ...store,
    months: {
      ...store.months,
      [monthKey]: {
        ...current,
        clients: focus === "client" ? nextBucket : current.clients,
        vehicles: focus === "vehicle" ? nextBucket : current.vehicles,
        drivers: focus === "driver" ? nextBucket : current.drivers,
      },
    },
  };
}

export type CarryForwardScope = "aggregate" | GoalFocus | "all";

/** Copy targets from one month into another (carry forward flow). */
export function carryForwardGoals(
  store: NetworkGoalsStore,
  fromMonthKey: string,
  toMonthKey: string,
  scope: CarryForwardScope = "all",
): NetworkGoalsStore {
  const source = getMonthStore(store, fromMonthKey);
  const dest = getMonthStore(store, toMonthKey);

  const next: NetworkGoalsMonthStore = { ...dest };

  if (scope === "aggregate" || scope === "all") {
    next.aggregate = { ...source.aggregate };
  }
  if (scope === "client" || scope === "all") {
    next.clients = { ...source.clients };
  }
  if (scope === "vehicle" || scope === "all") {
    next.vehicles = { ...source.vehicles };
  }
  if (scope === "driver" || scope === "all") {
    next.drivers = { ...source.drivers };
  }

  return {
    ...store,
    months: {
      ...store.months,
      [toMonthKey]: next,
    },
  };
}

async function migrateV1ToV2(orgId: string): Promise<NetworkGoalsStore | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY_V1(orgId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      clientSalesInr?: number;
      supplierCostInr?: number;
      vehicleTrips?: number;
      driverTrips?: number;
    };
    const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const store: NetworkGoalsStore = {
      version: 2,
      months: {
        [monthKey]: {
          aggregate: {
            revenueInr: Math.max(0, Number(parsed.clientSalesInr) || 0),
            tripCount: Math.max(
              0,
              Math.round(Number(parsed.vehicleTrips) || 0) +
                Math.round(Number(parsed.driverTrips) || 0),
            ),
            marginPct: 0,
          },
          clients: {},
          vehicles: {},
          drivers: {},
        },
      },
      updatedAt: new Date().toISOString(),
    };
    await saveNetworkGoalsStore(orgId, store);
    return store;
  } catch {
    return null;
  }
}

export async function loadNetworkGoalsStore(
  orgId: string,
): Promise<NetworkGoalsStore> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY_V2(orgId));
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<NetworkGoalsStore>;
      const months: Record<string, NetworkGoalsMonthStore> = {};
      for (const [key, val] of Object.entries(parsed.months ?? {})) {
        months[key] = parseMonthStore(val);
      }
      return {
        version: 2,
        months,
        updatedAt: parsed.updatedAt ?? "",
      };
    }
    const migrated = await migrateV1ToV2(orgId);
    if (migrated) return migrated;
    return { ...DEFAULT_NETWORK_GOALS_STORE };
  } catch {
    return { ...DEFAULT_NETWORK_GOALS_STORE };
  }
}

export async function saveNetworkGoalsStore(
  orgId: string,
  store: NetworkGoalsStore,
): Promise<void> {
  await AsyncStorage.setItem(
    STORAGE_KEY_V2(orgId),
    JSON.stringify({
      ...store,
      version: 2,
      updatedAt: new Date().toISOString(),
    }),
  );
}
