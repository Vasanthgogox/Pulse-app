/**
 * Trip Adjustment Registry — adjusts revenue (sales) or cost (supplier), not in/out ledger.
 * Examples: Loading charges, Unloading, Late delivery, Damages/Missing, Fuel escalation, Detention.
 * Persisted locally via AsyncStorage until backend trip_adjustments table exists.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY_PREFIX = "q_mobile_trip_adjustments:";

export type TripAdjustmentType = "revenue" | "cost";
export type TripAdjustmentImpact = "plus" | "minus";

export interface TripAdjustment {
  id: string;
  trip_id: string;
  /** Revenue (sale) or Cost (supplier/aggregate) */
  type: TripAdjustmentType;
  /** Addition or deduction */
  impact: TripAdjustmentImpact;
  /** Always positive; sign implied by impact */
  amount: number;
  reason: string;
  created_at?: string;
}

/** Preset reasons for revenue adjustments (client/sale side). */
export const REVENUE_REASON_OPTIONS = [
  "Loading Charges",
  "Unloading Charges",
  "Late Delivery",
  "Damages / Missing",
  "Other",
] as const;

/** Preset reasons for cost adjustments (supplier/aggregate side). */
export const COST_REASON_OPTIONS = [
  "Fuel Escalation",
  "Detention",
  "Loading Charges",
  "Unloading Charges",
  "Damages / Missing",
  "Pass Debit",
  "Other",
] as const;

function storageKey(tripId: string): string {
  return `${STORAGE_KEY_PREFIX}${tripId}`;
}

export async function getTripAdjustments(tripId: string): Promise<TripAdjustment[]> {
  try {
    const raw = await AsyncStorage.getItem(storageKey(tripId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as TripAdjustment[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function setTripAdjustments(
  tripId: string,
  adjustments: TripAdjustment[],
): Promise<void> {
  await AsyncStorage.setItem(storageKey(tripId), JSON.stringify(adjustments));
}

export async function addTripAdjustment(
  tripId: string,
  adjustment: Omit<TripAdjustment, "id" | "trip_id" | "created_at">,
): Promise<TripAdjustment> {
  const list = await getTripAdjustments(tripId);
  const created_at = new Date().toISOString();
  const id = `adj_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const newRow: TripAdjustment = {
    ...adjustment,
    id,
    trip_id: tripId,
    created_at,
  };
  list.push(newRow);
  await setTripAdjustments(tripId, list);
  return newRow;
}

export async function removeTripAdjustment(tripId: string, adjustmentId: string): Promise<void> {
  const list = await getTripAdjustments(tripId);
  const next = list.filter((a) => a.id !== adjustmentId);
  await setTripAdjustments(tripId, next);
}

/** Compute adjusted revenue: base + (revenue plus) - (revenue minus). */
export function adjustedRevenue(baseSales: number, adjustments: TripAdjustment[]): number {
  const revenueAdj = adjustments.filter((a) => a.type === "revenue");
  const delta = revenueAdj.reduce(
    (sum, a) => sum + (a.impact === "plus" ? a.amount : -a.amount),
    0,
  );
  return Math.max(0, baseSales + delta);
}

/** Compute adjusted cost: base + (cost plus) - (cost minus). */
export function adjustedCost(baseCost: number, adjustments: TripAdjustment[]): number {
  const costAdj = adjustments.filter((a) => a.type === "cost");
  const delta = costAdj.reduce(
    (sum, a) => sum + (a.impact === "plus" ? a.amount : -a.amount),
    0,
  );
  return Math.max(0, baseCost + delta);
}
