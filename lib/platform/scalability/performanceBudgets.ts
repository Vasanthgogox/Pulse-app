/**
 * Performance budgets — Scalability & Reliability Platform law.
 * Screens / actions that exceed these fail review unless the charter Evidence
 * section is updated with measured justification.
 * @see docs/SCALABILITY_PLATFORM.md
 */

export const SUBSCRIPTION_BUDGETS = {
  home: 5,
  tripDetail: 8,
  chat: 4,
  marketplace: 6,
  finance: 4,
  fleetTracking: 6,
} as const;

export type SubscriptionBudgetSurface = keyof typeof SUBSCRIPTION_BUDGETS;

export const ACTION_DB_BUDGETS = {
  placeBid: { writes: 2, triggers: 2, realtimeEvents: 2, invalidations: 2, queries: 3 },
  sendChatMessage: { writes: 2, triggers: 2, realtimeEvents: 2, invalidations: 2, queries: 2 },
  tripStatusUpdate: { writes: 2, triggers: 3, realtimeEvents: 2, invalidations: 2, queries: 3 },
  driverGpsPing: { writes: 1, triggers: 1, realtimeEvents: 1, invalidations: 0, queries: 0 },
} as const;

export type ActionDbBudgetKey = keyof typeof ACTION_DB_BUDGETS;

export const RENDER_BUDGETS = {
  realtimeMessage: 3,
  tripStatusUpdate: 2,
  /** Max location-driven re-renders per second on a focused map. */
  locationUpdatePerSec: 1,
} as const;

export const PLATFORM_SUCCESS_TARGETS = {
  dbCpuAt50UsersPct: 70,
  poolUtilizationPct: 70,
  realtimeCallbacksPerEvent: 5,
  cacheInvalidationsPerEvent: 2,
  uiRendersPerEvent: 5,
  chatP95Ms: 300,
  bidP95Ms: 500,
  failedRealtimeDeliveries: 0,
  hiddenScreenSubscriptions: 0,
} as const;
