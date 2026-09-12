import { useMemo } from 'react';
import { lateMonitoringTripsFromActive } from '@/lib/globalSync/lateMonitoringFromTrips.util';
import type { GlobalOperationAlert } from '@/lib/globalSync/priorityEngine.util';
import {
  buildRegistryFeed,
  type RegistryFeedEntry,
} from '@/lib/globalSync/registryFeed.util';
import { useAlertRegistryNotifications } from '@/lib/globalSync/useAlertRegistryNotifications';
import { useGlobalSyncStore } from '@/lib/globalSync/useGlobalSyncStore';
import { useOperationsShelfItems } from '@/lib/globalSync/useOperationsDerived';
import { useNetworkNotificationsQuery } from '@/lib/queries/useNetworkNotificationsQuery';

/**
 * Unified registry feed. Ops + finance lanes are derived from the bootstrap store
 * (zero extra DB). The network lane is the one exception: cross-org indent/bid/
 * award events cannot be derived locally, so they are read from
 * `network_notifications` and kept live over realtime.
 *
 * Both lifecycle tabs are built in one pass so the notifications panel does not
 * subscribe/rebuild the same derivation 3–4 times.
 */
export function useRegistryFeed(orgId: string | null): {
  activeFeed: RegistryFeedEntry[];
  historyFeed: RegistryFeedEntry[];
  opsAlerts: GlobalOperationAlert[];
} {
  const items = useOperationsShelfItems();
  const activeTrips = useGlobalSyncStore((s) => s.activeTrips);
  const {
    activeSalaryRequests,
    historySalaryRequests,
  } = useAlertRegistryNotifications(orgId);
  const { data: networkNotifications } = useNetworkNotificationsQuery(orgId);

  const { activeNetwork, historyNetwork } = useMemo(() => {
    const active = networkNotifications.filter((n) => n.status === 'open');
    const history = networkNotifications.filter((n) => n.status !== 'open');
    return { activeNetwork: active, historyNetwork: history };
  }, [networkNotifications]);

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

  const opsAlertsForFeed = useMemo(() => {
    if (activeSalaryRequests.length === 0) return opsAlerts;
    return opsAlerts.filter((a) => a.category !== 'salary');
  }, [opsAlerts, activeSalaryRequests.length]);

  const activeFeed = useMemo(
    () =>
      buildRegistryFeed({
        tab: 'active',
        opsAlerts: opsAlertsForFeed,
        activeSalary: activeSalaryRequests,
        historySalary: historySalaryRequests,
        activeNetwork,
        historyNetwork,
      }),
    [
      opsAlertsForFeed,
      activeSalaryRequests,
      historySalaryRequests,
      activeNetwork,
      historyNetwork,
    ],
  );

  const historyFeed = useMemo(
    () =>
      buildRegistryFeed({
        tab: 'history',
        opsAlerts: opsAlertsForFeed,
        activeSalary: activeSalaryRequests,
        historySalary: historySalaryRequests,
        activeNetwork,
        historyNetwork,
      }),
    [
      opsAlertsForFeed,
      activeSalaryRequests,
      historySalaryRequests,
      activeNetwork,
      historyNetwork,
    ],
  );

  return { activeFeed, historyFeed, opsAlerts };
}
