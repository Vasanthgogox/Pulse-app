/**
 * Per-org performance targets for the Network hub Goals tab (client-side persistence).
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

export type GoalDimension = "client" | "supplier" | "vehicle" | "driver";

export type NetworkOrgGoals = {
  /** Monthly client sales target (INR). */
  clientSalesInr: number;
  /** Monthly supplier cost budget (INR). */
  supplierCostInr: number;
  /** Monthly vehicle trip count target. */
  vehicleTrips: number;
  /** Monthly driver trip count target. */
  driverTrips: number;
  updatedAt: string;
};

export const DEFAULT_NETWORK_ORG_GOALS: NetworkOrgGoals = {
  clientSalesInr: 0,
  supplierCostInr: 0,
  vehicleTrips: 0,
  driverTrips: 0,
  updatedAt: "",
};

function storageKey(orgId: string): string {
  return `network-hub-goals:v1:${orgId}`;
}

export async function loadNetworkOrgGoals(
  orgId: string,
): Promise<NetworkOrgGoals> {
  try {
    const raw = await AsyncStorage.getItem(storageKey(orgId));
    if (!raw) return { ...DEFAULT_NETWORK_ORG_GOALS };
    const parsed = JSON.parse(raw) as Partial<NetworkOrgGoals>;
    return {
      clientSalesInr: Math.max(0, Number(parsed.clientSalesInr) || 0),
      supplierCostInr: Math.max(0, Number(parsed.supplierCostInr) || 0),
      vehicleTrips: Math.max(0, Math.round(Number(parsed.vehicleTrips) || 0)),
      driverTrips: Math.max(0, Math.round(Number(parsed.driverTrips) || 0)),
      updatedAt: parsed.updatedAt ?? "",
    };
  } catch {
    return { ...DEFAULT_NETWORK_ORG_GOALS };
  }
}

export async function saveNetworkOrgGoals(
  orgId: string,
  goals: NetworkOrgGoals,
): Promise<void> {
  await AsyncStorage.setItem(
    storageKey(orgId),
    JSON.stringify({
      ...goals,
      updatedAt: new Date().toISOString(),
    }),
  );
}

export function goalValueForDimension(
  goals: NetworkOrgGoals,
  dimension: GoalDimension,
): number {
  if (dimension === "client") return goals.clientSalesInr;
  if (dimension === "supplier") return goals.supplierCostInr;
  if (dimension === "vehicle") return goals.vehicleTrips;
  return goals.driverTrips;
}

export function patchGoalDimension(
  goals: NetworkOrgGoals,
  dimension: GoalDimension,
  value: number,
): NetworkOrgGoals {
  const safe = Math.max(0, value);
  if (dimension === "client") return { ...goals, clientSalesInr: safe };
  if (dimension === "supplier") return { ...goals, supplierCostInr: safe };
  if (dimension === "vehicle") {
    return { ...goals, vehicleTrips: Math.round(safe) };
  }
  return { ...goals, driverTrips: Math.round(safe) };
}
