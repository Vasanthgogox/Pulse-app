// ── Global Sync public API ────────────────────────────────────────────────────
// Mount GlobalSyncProvider once in _layout.tsx (inside Auth + Org providers).
// All UI components read from useGlobalSyncStore selectors — zero direct DB calls.

export { GlobalSyncProvider, useGlobalSync } from './GlobalSyncContext';
export { useGlobalSyncStore }                from './useGlobalSyncStore';
export { useGlobalSyncHealthCheck }          from './healthCheck';
export type {
  GlobalSyncBootstrapStatus,
  GlobalNotificationRow,
  GlobalAlertRow,
  GlobalNetworkStatus,
  ActiveTripSummary,
  ActiveTripRecentEvent,
  GlobalAppBootstrapPayload,
} from './types';
