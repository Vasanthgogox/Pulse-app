/**
 * TanStack Query hooks for the Analytics modules.
 * ============================================================================
 *
 * Wraps the RPC service in `features/analytics/services/analytics.service.ts`
 * and uses keys from `queryKeys.analytics.*` so realtime invalidation
 * (`useRealtimeInvalidation`) can target precise scopes.
 *
 * Stale-time policy (analytics data isn't realtime — aggregated over months):
 *   • monthly aggregations   : 300s (5 min)
 *   • score RPCs             : 600s (10 min)
 *
 * Caller convention:
 *   const { data, isLoading, error } = useClientMonthlyAnalyticsQuery(
 *     orgId, clientId, 12,
 *   );
 *   // data.rows is the array; data.error is the unwrapped error if any.
 */

import { useQuery } from "@tanstack/react-query";

import {
  getClientMonthlyAnalytics,
  getCustomerHealthScore,
  getDriverMonthlyAnalytics,
  getDriverPerformanceScore,
  getSupplierMonthlyAnalytics,
  getSupplierReliabilityScore,
  getVehicleMonthlyAnalytics,
} from "@/features/analytics";
import { queryKeys } from "@/lib/queryKeys";

const ANALYTICS_NOOP_KEY = ["q", "analytics", "noop"] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Client analytics
// ─────────────────────────────────────────────────────────────────────────────

export function useClientMonthlyAnalyticsQuery(
  orgId: string | null,
  clientId: string | null,
  monthsBack = 12,
) {
  return useQuery({
    queryKey:
      orgId && clientId
        ? queryKeys.analytics.clientMonthly(orgId, clientId, monthsBack)
        : ANALYTICS_NOOP_KEY,
    queryFn: () => getClientMonthlyAnalytics(orgId!, clientId!, monthsBack),
    enabled: !!orgId && !!clientId,
    staleTime: 300_000,
    select: (data) => data.rows,
  });
}

export function useCustomerHealthScoreQuery(
  orgId: string | null,
  clientId: string | null,
) {
  return useQuery({
    queryKey:
      orgId && clientId
        ? queryKeys.analytics.clientHealth(orgId, clientId)
        : ANALYTICS_NOOP_KEY,
    queryFn: () => getCustomerHealthScore(orgId!, clientId!),
    enabled: !!orgId && !!clientId,
    staleTime: 600_000,
    select: (data) => data.score,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Supplier analytics
// ─────────────────────────────────────────────────────────────────────────────

export function useSupplierMonthlyAnalyticsQuery(
  orgId: string | null,
  supplierId: string | null,
  monthsBack = 12,
) {
  return useQuery({
    queryKey:
      orgId && supplierId
        ? queryKeys.analytics.supplierMonthly(orgId, supplierId, monthsBack)
        : ANALYTICS_NOOP_KEY,
    queryFn: () => getSupplierMonthlyAnalytics(orgId!, supplierId!, monthsBack),
    enabled: !!orgId && !!supplierId,
    staleTime: 300_000,
    select: (data) => data.rows,
  });
}

export function useSupplierReliabilityScoreQuery(
  orgId: string | null,
  supplierId: string | null,
) {
  return useQuery({
    queryKey:
      orgId && supplierId
        ? queryKeys.analytics.supplierReliability(orgId, supplierId)
        : ANALYTICS_NOOP_KEY,
    queryFn: () => getSupplierReliabilityScore(orgId!, supplierId!),
    enabled: !!orgId && !!supplierId,
    staleTime: 600_000,
    select: (data) => data.score,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Driver analytics
// ─────────────────────────────────────────────────────────────────────────────

export function useDriverMonthlyAnalyticsQuery(
  orgId: string | null,
  driverId: string | null,
  monthsBack = 12,
) {
  return useQuery({
    queryKey:
      orgId && driverId
        ? queryKeys.analytics.driverMonthly(orgId, driverId, monthsBack)
        : ANALYTICS_NOOP_KEY,
    queryFn: () => getDriverMonthlyAnalytics(orgId!, driverId!, monthsBack),
    enabled: !!orgId && !!driverId,
    staleTime: 300_000,
    select: (data) => data.rows,
  });
}

export function useDriverPerformanceScoreQuery(
  orgId: string | null,
  driverId: string | null,
) {
  return useQuery({
    queryKey:
      orgId && driverId
        ? queryKeys.analytics.driverPerformance(orgId, driverId)
        : ANALYTICS_NOOP_KEY,
    queryFn: () => getDriverPerformanceScore(orgId!, driverId!),
    enabled: !!orgId && !!driverId,
    staleTime: 600_000,
    select: (data) => data.score,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Vehicle analytics (server-side; pre-existing tab still client-computes)
// ─────────────────────────────────────────────────────────────────────────────

export function useVehicleMonthlyAnalyticsQuery(
  orgId: string | null,
  vehicleId: string | null,
  monthsBack = 12,
) {
  return useQuery({
    queryKey:
      orgId && vehicleId
        ? queryKeys.analytics.vehicleMonthly(orgId, vehicleId, monthsBack)
        : ANALYTICS_NOOP_KEY,
    queryFn: () => getVehicleMonthlyAnalytics(orgId!, vehicleId!, monthsBack),
    enabled: !!orgId && !!vehicleId,
    staleTime: 300_000,
    select: (data) => data.rows,
  });
}
