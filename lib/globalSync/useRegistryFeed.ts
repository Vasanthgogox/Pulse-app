import { useMemo } from 'react';
import { lateMonitoringTripsFromActive } from '@/lib/globalSync/lateMonitoringFromTrips.util';
import type { GlobalOperationAlert } from '@/lib/globalSync/priorityEngine.util';
import { buildRegistryFeed } from '@/lib/globalSync/registryFeed.util';
import { useAlertRegistryNotifications } from '@/lib/globalSync/useAlertRegistryNotifications';
import { useGlobalSyncStore } from '@/lib/globalSync/useGlobalSyncStore';
import { useOperationsShelfItems } from '@/lib/globalSync/useOperationsDerived';

/** Unified registry feed (ops + finance) from bootstrap store — zero extra DB. */
export function useRegistryFeed(
  tab: 'active' | 'history',
  orgId: string | null,
) {
  const items = useOperationsShelfItems();
  const activeTrips = useGlobalSyncStore((s) => s.activeTrips);
  const {
    activeSalaryRequests,
    historySalaryRequests,
    activeSharedNotifications,
    historySharedNotifications,
  } = useAlertRegistryNotifications(orgId);

  const opsAlerts = useMemo((): GlobalOperationAlert[] => {
    const covered = new Set(
      items
        .map((i) => i.trip_id)
        .filter((id): id is string => typeof id === 'string' && id.length > 0),
    );
    const lateMonitoringAlerts = lateMonitoringTripsFromActive(activeTrips, covered).map(
      (t) => {
        const last = t.recent_events?.length
          ? t.recent_events[t.recent_events.length - 1]
          : undefined;
        const preview = (last?.content ?? '').trim().slice(0, 140);
        return {
          id: `late_monitor:${t.trip_id}`,
          priority_weight: 130,
          kind: 'critical' as const,
          category: 'late_log' as const,
          trip_id: t.trip_id,
          trip_number: t.display_trip_id ?? t.trip_number,
          title: 'system log',
          subtitle: preview
            ? `Vehicle behind schedule. ${preview}`
            : 'Vehicle behind schedule.',
          amount: null,
          created_at: t.created_at,
          source: 'trip_recent_event' as const,
        };
      },
    );
    const map = new Map<string, GlobalOperationAlert>();
    for (const a of [...items, ...lateMonitoringAlerts]) {
      map.set(a.id, a);
    }
    return Array.from(map.values()).sort(
      (a, b) => b.priority_weight - a.priority_weight,
    );
  }, [activeTrips, items]);

  const feed = useMemo(
    () =>
      buildRegistryFeed({
        tab,
        opsAlerts,
        activeSalary: activeSalaryRequests,
        historySalary: historySalaryRequests,
        activeShared: activeSharedNotifications,
        historyShared: historySharedNotifications,
      }),
    [
      tab,
      opsAlerts,
      activeSalaryRequests,
      historySalaryRequests,
      activeSharedNotifications,
      historySharedNotifications,
    ],
  );

  return { feed, opsAlerts };
}
