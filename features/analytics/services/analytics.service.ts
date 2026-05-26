/**
 * Analytics service — thin RPC wrappers for the four analytics modules.
 * ============================================================================
 *
 * Each function maps 1:1 to a SQL RPC defined in
 * `supabase/migrations/20260828020000_analytics_rpcs.sql`:
 *
 *   • `get_client_monthly_analytics(uuid, uuid, int)`
 *   • `get_supplier_monthly_analytics(uuid, uuid, int)`
 *   • `get_driver_monthly_analytics(uuid, uuid, int)`
 *   • `get_vehicle_monthly_analytics(uuid, uuid, int)`
 *   • `compute_client_health_score(uuid, uuid)`
 *   • `compute_supplier_reliability_score(uuid, uuid)`
 *   • `compute_driver_performance_score(uuid, uuid)`
 *
 * Numeric columns come back as JS strings under some PostgREST builds; we
 * coerce in `toNumber()` so consumers always see `number`. Errors are
 * returned as `{ error, data }` tuples — never thrown — so React Query
 * hooks can handle them inline without a try/catch.
 */

import { supabase } from "@/lib/supabase";

import type {
  ClientMonthlyAnalyticsRow,
  CustomerHealthScore,
  DriverMonthlyAnalyticsRow,
  DriverPerformanceScore,
  SupplierMonthlyAnalyticsRow,
  SupplierReliabilityScore,
} from "../types/analytics.types";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Coerce a PostgREST numeric (returned as string or number) to a `number`. */
function toNumber(v: unknown): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Default look-back when callers omit it. Matches RPC default. */
const DEFAULT_MONTHS_BACK = 12;

// ─────────────────────────────────────────────────────────────────────────────
// Client analytics
// ─────────────────────────────────────────────────────────────────────────────

export interface ClientAnalyticsResult {
  error: Error | null;
  rows: ClientMonthlyAnalyticsRow[];
}

export async function getClientMonthlyAnalytics(
  orgId: string,
  clientId: string,
  monthsBack = DEFAULT_MONTHS_BACK,
): Promise<ClientAnalyticsResult> {
  const { data, error } = await supabase().rpc("get_client_monthly_analytics", {
    p_org_id: orgId,
    p_client_id: clientId,
    p_months_back: monthsBack,
  });
  if (error) return { error: new Error(error.message), rows: [] };

  const rows = ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    period: String(r.period ?? ""),
    revenue: toNumber(r.revenue),
    margin: toNumber(r.margin),
    margin_pct: toNumber(r.margin_pct),
    trip_count: Math.round(toNumber(r.trip_count)),
    km_driven: toNumber(r.km_driven),
    collected: toNumber(r.collected),
    outstanding: toNumber(r.outstanding),
    avg_payment_delay_days: toNumber(r.avg_payment_delay_days),
    on_time_pct: toNumber(r.on_time_pct),
    cancellation_rate_pct: toNumber(r.cancellation_rate_pct),
  }));
  return { error: null, rows };
}

export async function getCustomerHealthScore(
  orgId: string,
  clientId: string,
): Promise<{ error: Error | null; score: CustomerHealthScore | null }> {
  const { data, error } = await supabase().rpc("compute_client_health_score", {
    p_org_id: orgId,
    p_client_id: clientId,
  });
  if (error) return { error: new Error(error.message), score: null };
  return { error: null, score: (data as CustomerHealthScore | null) ?? null };
}

// ─────────────────────────────────────────────────────────────────────────────
// Supplier analytics
// ─────────────────────────────────────────────────────────────────────────────

export interface SupplierAnalyticsResult {
  error: Error | null;
  rows: SupplierMonthlyAnalyticsRow[];
}

export async function getSupplierMonthlyAnalytics(
  orgId: string,
  supplierId: string,
  monthsBack = DEFAULT_MONTHS_BACK,
): Promise<SupplierAnalyticsResult> {
  const { data, error } = await supabase().rpc("get_supplier_monthly_analytics", {
    p_org_id: orgId,
    p_supplier_id: supplierId,
    p_months_back: monthsBack,
  });
  if (error) return { error: new Error(error.message), rows: [] };

  const rows = ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    period: String(r.period ?? ""),
    revenue_handled: toNumber(r.revenue_handled),
    supplier_payable: toNumber(r.supplier_payable),
    margin_contribution: toNumber(r.margin_contribution),
    margin_contribution_pct: toNumber(r.margin_contribution_pct),
    trip_count: Math.round(toNumber(r.trip_count)),
    km_driven: toNumber(r.km_driven),
    paid: toNumber(r.paid),
    outstanding: toNumber(r.outstanding),
    avg_settlement_days: toNumber(r.avg_settlement_days),
    on_time_pct: toNumber(r.on_time_pct),
    cancellation_rate_pct: toNumber(r.cancellation_rate_pct),
  }));
  return { error: null, rows };
}

export async function getSupplierReliabilityScore(
  orgId: string,
  supplierId: string,
): Promise<{ error: Error | null; score: SupplierReliabilityScore | null }> {
  const { data, error } = await supabase().rpc(
    "compute_supplier_reliability_score",
    {
      p_org_id: orgId,
      p_supplier_id: supplierId,
    },
  );
  if (error) return { error: new Error(error.message), score: null };
  return { error: null, score: (data as SupplierReliabilityScore | null) ?? null };
}

// ─────────────────────────────────────────────────────────────────────────────
// Driver analytics
// ─────────────────────────────────────────────────────────────────────────────

export interface DriverAnalyticsResult {
  error: Error | null;
  rows: DriverMonthlyAnalyticsRow[];
}

export async function getDriverMonthlyAnalytics(
  orgId: string,
  driverId: string,
  monthsBack = DEFAULT_MONTHS_BACK,
): Promise<DriverAnalyticsResult> {
  const { data, error } = await supabase().rpc("get_driver_monthly_analytics", {
    p_org_id: orgId,
    p_driver_id: driverId,
    p_months_back: monthsBack,
  });
  if (error) return { error: new Error(error.message), rows: [] };

  const rows = ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    period: String(r.period ?? ""),
    revenue: toNumber(r.revenue),
    earnings: toNumber(r.earnings),
    paid: toNumber(r.paid),
    trip_count: Math.round(toNumber(r.trip_count)),
    km_driven: toNumber(r.km_driven),
  }));
  return { error: null, rows };
}

export async function getDriverPerformanceScore(
  orgId: string,
  driverId: string,
): Promise<{ error: Error | null; score: DriverPerformanceScore | null }> {
  const { data, error } = await supabase().rpc(
    "compute_driver_performance_score",
    {
      p_org_id: orgId,
      p_driver_id: driverId,
    },
  );
  if (error) return { error: new Error(error.message), score: null };
  return { error: null, score: (data as DriverPerformanceScore | null) ?? null };
}

// ─────────────────────────────────────────────────────────────────────────────
// Vehicle (for completeness — RPC existed but was broken, now fixed)
// ─────────────────────────────────────────────────────────────────────────────

export interface VehicleMonthlyAnalyticsRow {
  period: string;
  revenue: number;
  expense: number;
  profit: number;
  margin_pct: number;
  trip_count: number;
  km_driven: number;
}

export async function getVehicleMonthlyAnalytics(
  orgId: string,
  vehicleId: string,
  monthsBack = DEFAULT_MONTHS_BACK,
): Promise<{ error: Error | null; rows: VehicleMonthlyAnalyticsRow[] }> {
  const { data, error } = await supabase().rpc("get_vehicle_monthly_analytics", {
    p_org_id: orgId,
    p_vehicle_id: vehicleId,
    p_months_back: monthsBack,
  });
  if (error) return { error: new Error(error.message), rows: [] };
  const rows = ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    period: String(r.period ?? ""),
    revenue: toNumber(r.revenue),
    expense: toNumber(r.expense),
    profit: toNumber(r.profit),
    margin_pct: toNumber(r.margin_pct),
    trip_count: Math.round(toNumber(r.trip_count)),
    km_driven: toNumber(r.km_driven),
  }));
  return { error: null, rows };
}
