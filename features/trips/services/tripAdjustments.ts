/**
 * Trip Adjustment Registry — revenue (sales) or cost (supplier), not cash ledger.
 * Stored in Supabase `trip_finance_adjustments` when online; AsyncStorage fallback.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "@/lib/supabase";

const ADJ_SELECT_FULL =
  "id, trip_id, organization_id, type, impact, amount, reason, mission_key, created_at, voided_at, void_reason";
const ADJ_SELECT_LEGACY =
  "id, trip_id, organization_id, type, impact, amount, reason, created_at";

function isMissingAdjustmentColumnError(err: { message?: string; code?: string } | null): boolean {
  if (!err?.message) return false;
  const m = err.message.toLowerCase();
  return (
    (m.includes("voided_at") || m.includes("void_reason") || m.includes("mission_key")) &&
    (m.includes("does not exist") || m.includes("column") || m.includes("schema cache") || err.code === "42703")
  );
}

const STORAGE_KEY_PREFIX = "q_mobile_trip_adjustments:";

export type TripAdjustmentType = "revenue" | "cost";
export type TripAdjustmentImpact = "plus" | "minus";

export interface TripAdjustment {
  id: string;
  trip_id: string;
  type: TripAdjustmentType;
  impact: TripAdjustmentImpact;
  amount: number;
  reason: string;
  created_at?: string;
  /** Owning org — used to split You vs They in Shared Ledger */
  organization_id?: string;
  mission_key?: string | null;
  /** When set, line is excluded from adjusted sale/cost but kept for audit (soft void). */
  voided_at?: string | null;
  void_reason?: string | null;
}

export interface TripAdjustmentPersistContext {
  organizationId: string;
  missionKey: string | null;
}

export const REVENUE_REASON_OPTIONS = [
  "Loading Charges",
  "Unloading Charges",
  "Late Delivery",
  "Damages / Missing",
  "Other",
] as const;

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

function normalizeMissionKey(raw: string | null | undefined): string | null {
  const s = String(raw ?? "").trim();
  return s.length ? s.toUpperCase() : null;
}

type TripFinanceAdjustmentRowDb = {
  id: string;
  trip_id: string;
  organization_id: string;
  type: string;
  impact: string;
  amount: number | string;
  reason: string;
  mission_key?: string | null;
  created_at?: string;
  voided_at?: string | null;
  void_reason?: string | null;
};

export function isAdjustmentVoided(a: TripAdjustment): boolean {
  const t = String(a.voided_at ?? "").trim();
  return t.length > 0;
}

function rowFromRemote(row: TripFinanceAdjustmentRowDb): TripAdjustment {
  return {
    id: row.id,
    trip_id: row.trip_id,
    organization_id: row.organization_id,
    type: row.type === "cost" ? "cost" : "revenue",
    impact: row.impact === "minus" ? "minus" : "plus",
    amount: Number(row.amount ?? 0),
    reason: row.reason ?? "",
    created_at: row.created_at,
    mission_key: row.mission_key ?? null,
    voided_at: row.voided_at ?? null,
    void_reason: row.void_reason ?? null,
  };
}

async function loadRemoteForTrip(tripId: string): Promise<TripAdjustment[]> {
  const query = (select: string) =>
    supabase()
      .from("trip_finance_adjustments")
      .select(select)
      .eq("trip_id", tripId)
      .order("created_at", { ascending: true });

  let { data, error } = await query(ADJ_SELECT_FULL);

  if (error && isMissingAdjustmentColumnError(error)) {
    if (__DEV__) console.warn("[tripAdjustments] schema drift — retrying without new columns:", error.message);
    ({ data, error } = await query(ADJ_SELECT_LEGACY));
  }

  if (error) {
    if (__DEV__) console.warn("[tripAdjustments] loadRemoteForTrip failed:", error.message);
    return [];
  }
  if (!data?.length) return [];
  return (data as unknown as TripFinanceAdjustmentRowDb[]).map(rowFromRemote);
}

export async function getTripAdjustments(tripId: string): Promise<TripAdjustment[]> {
  const remote = await loadRemoteForTrip(tripId);
  try {
    const raw = await AsyncStorage.getItem(storageKey(tripId));
    const parsed = raw ? (JSON.parse(raw) as TripAdjustment[]) : [];
    const local = Array.isArray(parsed) ? parsed : [];
    const remoteIds = new Set(remote.map((r) => r.id));
    const merged = [...remote];
    for (const a of local) {
      if (!remoteIds.has(a.id)) merged.push(a);
    }
    merged.sort((x, y) =>
      String(x.created_at ?? "").localeCompare(String(y.created_at ?? "")),
    );
    return merged;
  } catch {
    return remote;
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
  ctx?: TripAdjustmentPersistContext,
): Promise<TripAdjustment> {
  const created_at = new Date().toISOString();

  if (ctx?.organizationId) {
    try {
      const mission_key = normalizeMissionKey(ctx.missionKey);
      const payload = {
        trip_id: tripId,
        organization_id: ctx.organizationId,
        type: adjustment.type,
        impact: adjustment.impact,
        amount: adjustment.amount,
        reason: adjustment.reason,
        mission_key,
      };
      const selectFull =
        "id, trip_id, organization_id, type, impact, amount, reason, mission_key, created_at, voided_at, void_reason";
      const selectLegacy =
        "id, trip_id, organization_id, type, impact, amount, reason, mission_key, created_at";
      let { data, error } = await supabase()
        .from("trip_finance_adjustments")
        .insert(payload)
        .select(selectFull)
        .single();
      if (error && isMissingAdjustmentColumnError(error)) {
        ({ data, error } = await supabase()
          .from("trip_finance_adjustments")
          .insert(payload)
          .select(selectLegacy)
          .single());
      }
      if (!error && data) {
        return rowFromRemote(data as TripFinanceAdjustmentRowDb);
      }
    } catch {
      /* local fallback */
    }
  }

  const raw = await AsyncStorage.getItem(storageKey(tripId));
  const parsed = raw ? (JSON.parse(raw) as TripAdjustment[]) : [];
  const list = Array.isArray(parsed) ? parsed : [];
  const id = `adj_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const newRow: TripAdjustment = {
    ...adjustment,
    id,
    trip_id: tripId,
    created_at,
    mission_key: ctx?.missionKey != null ? normalizeMissionKey(ctx.missionKey) : undefined,
    organization_id: ctx?.organizationId,
  };
  list.push(newRow);
  await setTripAdjustments(tripId, list);
  return newRow;
}

/**
 * Soft-void: row stays in registry with audit reason; excluded from {@link adjustedRevenue} / {@link adjustedCost}.
 */
export async function voidTripAdjustment(
  tripId: string,
  adjustmentId: string,
  voidReason: string,
): Promise<void> {
  const reason = String(voidReason ?? "").trim();
  if (!reason) return;
  const voided_at = new Date().toISOString();
  try {
    await supabase()
      .from("trip_finance_adjustments")
      .update({ voided_at, void_reason: reason })
      .eq("id", adjustmentId)
      .eq("trip_id", tripId);
  } catch {
    /* offline / RLS */
  }
  try {
    const raw = await AsyncStorage.getItem(storageKey(tripId));
    const parsed = raw ? (JSON.parse(raw) as TripAdjustment[]) : [];
    let local = Array.isArray(parsed) ? parsed : [];
    const remoteList = await loadRemoteForTrip(tripId);
    const idx = local.findIndex((a) => a.id === adjustmentId);
    const remoteRow = remoteList.find((a) => a.id === adjustmentId);
    const base = idx >= 0 ? local[idx] : remoteRow;
    if (!base) return;
    const updated: TripAdjustment = {
      ...base,
      voided_at,
      void_reason: reason,
    };
    const without = local.filter((a) => a.id !== adjustmentId);
    without.push(updated);
    local = without;
    await setTripAdjustments(tripId, local);
  } catch {
    /* ignore */
  }
}

export async function updateTripAdjustment(
  tripId: string,
  adjustmentId: string,
  patch: {
    type: TripAdjustmentType;
    impact: TripAdjustmentImpact;
    amount: number;
    reason: string;
  },
): Promise<void> {
  try {
    await supabase()
      .from("trip_finance_adjustments")
      .update({
        type: patch.type,
        impact: patch.impact,
        amount: patch.amount,
        reason: patch.reason,
      })
      .eq("id", adjustmentId)
      .eq("trip_id", tripId);
  } catch {
    /* offline / RLS */
  }
  try {
    const raw = await AsyncStorage.getItem(storageKey(tripId));
    const parsed = raw ? (JSON.parse(raw) as TripAdjustment[]) : [];
    const local = Array.isArray(parsed) ? parsed : [];
    const idx = local.findIndex((a) => a.id === adjustmentId);
    if (idx >= 0) {
      local[idx] = {
        ...local[idx],
        type: patch.type,
        impact: patch.impact,
        amount: patch.amount,
        reason: patch.reason,
      };
      await setTripAdjustments(tripId, local);
    }
  } catch {
    /* ignore */
  }
}

export function adjustedRevenue(baseSales: number, adjustments: TripAdjustment[]): number {
  const revenueAdj = adjustments.filter((a) => a.type === "revenue" && !isAdjustmentVoided(a));
  const delta = revenueAdj.reduce(
    (sum, a) => sum + (a.impact === "plus" ? a.amount : -a.amount),
    0,
  );
  return Math.max(0, baseSales + delta);
}

export function adjustedCost(baseCost: number, adjustments: TripAdjustment[]): number {
  const costAdj = adjustments.filter((a) => a.type === "cost" && !isAdjustmentVoided(a));
  const delta = costAdj.reduce(
    (sum, a) => sum + (a.impact === "plus" ? a.amount : -a.amount),
    0,
  );
  return Math.max(0, baseCost + delta);
}

/** Normalize trip id for adjustment map lookups (aligned with finance aggregation). */
export function normTripFinanceAdjustmentKey(id: string | null | undefined): string {
  return id == null ? "" : String(id).trim().toLowerCase();
}

const ADJ_FETCH_CHUNK = 90;

/**
 * Load persisted trip finance adjustments for many trips (batched `.in` queries).
 * Returns a map keyed by {@link normTripFinanceAdjustmentKey}(trip_id).
 */
export async function fetchTripFinanceAdjustmentsByTripIds(
  tripIds: string[],
): Promise<Map<string, TripAdjustment[]>> {
  const out = new Map<string, TripAdjustment[]>();
  const uniq = [...new Set(tripIds.filter(Boolean).map((id) => String(id)))];
  if (uniq.length === 0) return out;

  for (let i = 0; i < uniq.length; i += ADJ_FETCH_CHUNK) {
    const chunk = uniq.slice(i, i + ADJ_FETCH_CHUNK);
    try {
      const { data, error } = await supabase()
        .from("trip_finance_adjustments")
        .select(
          "id, trip_id, organization_id, type, impact, amount, reason, mission_key, created_at, voided_at, void_reason",
        )
        .in("trip_id", chunk)
        .order("created_at", { ascending: true });
      if (error || !data?.length) continue;
      for (const row of data as TripFinanceAdjustmentRowDb[]) {
        const adj = rowFromRemote(row);
        const key = normTripFinanceAdjustmentKey(adj.trip_id);
        const list = out.get(key) ?? [];
        list.push(adj);
        out.set(key, list);
      }
    } catch {
      /* offline / RLS — leave partial */
    }
  }
  return out;
}
