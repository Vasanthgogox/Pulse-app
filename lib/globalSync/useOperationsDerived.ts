import { useMemo } from 'react';
import {
  selectCurrentActiveAlert,
  selectOperationsShelfItems,
  selectVehicleIdleToast,
  type GlobalOperationAlert,
} from './priorityEngine.util';
import { useGlobalSyncStore } from './useGlobalSyncStore';

/**
 * Priority selectors build **new** arrays/objects. Feeding them directly into
 * `useGlobalSyncStore(selector)` makes `getSnapshot` return a new reference every
 * time → React “Maximum update depth exceeded”. These hooks subscribe to stable
 * slices and `useMemo` the derived value.
 */
export function useOperationsShelfItems(): GlobalOperationAlert[] {
  const activeTrips = useGlobalSyncStore((s) => s.activeTrips);
  const alertRows = useGlobalSyncStore((s) => s.alertRows);
  const notificationRows = useGlobalSyncStore((s) => s.notificationRows);
  const clientOperationsRibbon = useGlobalSyncStore((s) => s.clientOperationsRibbon);
  const dismissedOperationKeys = useGlobalSyncStore((s) => s.dismissedOperationKeys);

  return useMemo(
    () =>
      selectOperationsShelfItems({
        activeTrips,
        alertRows,
        notificationRows,
        clientOperationsRibbon,
        dismissedOperationKeys,
      }),
    [activeTrips, alertRows, notificationRows, clientOperationsRibbon, dismissedOperationKeys],
  );
}

export function useCurrentOperationAlert(): GlobalOperationAlert | null {
  const activeTrips = useGlobalSyncStore((s) => s.activeTrips);
  const alertRows = useGlobalSyncStore((s) => s.alertRows);
  const notificationRows = useGlobalSyncStore((s) => s.notificationRows);
  const clientOperationsRibbon = useGlobalSyncStore((s) => s.clientOperationsRibbon);
  const dismissedOperationKeys = useGlobalSyncStore((s) => s.dismissedOperationKeys);

  return useMemo(
    () =>
      selectCurrentActiveAlert({
        activeTrips,
        alertRows,
        notificationRows,
        clientOperationsRibbon,
        dismissedOperationKeys,
      }),
    [activeTrips, alertRows, notificationRows, clientOperationsRibbon, dismissedOperationKeys],
  );
}

export function useVehicleIdleToastAlert(): GlobalOperationAlert | null {
  const activeTrips = useGlobalSyncStore((s) => s.activeTrips);
  const alertRows = useGlobalSyncStore((s) => s.alertRows);
  const notificationRows = useGlobalSyncStore((s) => s.notificationRows);
  const clientOperationsRibbon = useGlobalSyncStore((s) => s.clientOperationsRibbon);
  const dismissedOperationKeys = useGlobalSyncStore((s) => s.dismissedOperationKeys);

  return useMemo(
    () =>
      selectVehicleIdleToast({
        activeTrips,
        alertRows,
        notificationRows,
        clientOperationsRibbon,
        dismissedOperationKeys,
      }),
    [activeTrips, alertRows, notificationRows, clientOperationsRibbon, dismissedOperationKeys],
  );
}
