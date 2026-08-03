/**
 * Platform Health snapshot — Scalability & Reliability Platform P0.
 * Aggregates client-side realtime + cache metrics. DB CPU/pool come from
 * Supabase dashboards until server-side instrumentation lands.
 * @see docs/SCALABILITY_PLATFORM.md
 */
import {
  getRealtimeHealth,
  getRealtimeRegistryDiagnostics,
  listRealtimeRegistryEntries,
} from "../../realtimeRegistry";
import { getQueryCacheMetrics } from "./queryCacheMetrics";
import {
  PLATFORM_SUCCESS_TARGETS,
  SUBSCRIPTION_BUDGETS,
} from "./performanceBudgets";

export type PlatformHealthSnapshot = {
  capturedAt: string;
  realtime: ReturnType<typeof getRealtimeHealth> &
    ReturnType<typeof getRealtimeRegistryDiagnostics> & {
      channels: ReturnType<typeof listRealtimeRegistryEntries>;
    };
  cache: ReturnType<typeof getQueryCacheMetrics>;
  budgets: {
    subscription: typeof SUBSCRIPTION_BUDGETS;
    successTargets: typeof PLATFORM_SUCCESS_TARGETS;
  };
  /** Client cannot read Supabase pool/CPU directly — placeholders for dashboard. */
  database: {
    source: "supabase-dashboard";
    note: string;
  };
};

export function getPlatformHealthSnapshot(): PlatformHealthSnapshot {
  const diagnostics = getRealtimeRegistryDiagnostics();
  const health = getRealtimeHealth();
  return {
    capturedAt: new Date().toISOString(),
    realtime: {
      ...health,
      ...diagnostics,
      channels: listRealtimeRegistryEntries(),
    },
    cache: getQueryCacheMetrics(),
    budgets: {
      subscription: SUBSCRIPTION_BUDGETS,
      successTargets: PLATFORM_SUCCESS_TARGETS,
    },
    database: {
      source: "supabase-dashboard",
      note: "Use Supabase Advisors + Database → Reports for CPU, pool, locks, slow queries until server metrics are wired.",
    },
  };
}
