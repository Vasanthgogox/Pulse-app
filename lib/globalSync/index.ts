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
  ActiveTripLastKnownLocation,
  ActiveTripRecentEvent,
  GlobalAppBootstrapPayload,
} from './types';
export type {
  ClientOperationsRibbon,
  GlobalOperationAlert,
  OperationCategory,
  OperationsIslandVisualKind,
} from './priorityEngine.util';
export {
  assignPriorityWeightFromTripMessage,
  collectAllOperationSignals,
  selectCurrentActiveAlert,
  selectOperationsShelfItems,
  selectVehicleIdleToast,
} from './priorityEngine.util';
export {
  useCurrentOperationAlert,
  useOperationsShelfItems,
  useVehicleIdleToastAlert,
} from './useOperationsDerived';
export { useAlertRegistryNotifications } from './useAlertRegistryNotifications';
export { useInboundProtocolInvites } from './useInboundProtocolInvites';
export { useRegistryFeed } from './useRegistryFeed';
export {
  REGISTRY_PAGE_SIZE,
  REGISTRY_BOOTSTRAP_SALARY_LIMIT,
  REGISTRY_LOAD_MORE_SALARY_LIMIT,
} from './registryFeed.constants';
