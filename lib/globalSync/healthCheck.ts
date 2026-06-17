/**
 * useGlobalSyncHealthCheck — dev-only performance monitor for the global sync store.
 *
 * Logs a compact summary every 30 seconds in __DEV__ mode:
 *   [GlobalSync] ✓ ready 312ms | trips:8 | alerts:2 | notifs:5 unread | network:3 links
 *
 * Mount it once near the root (e.g. inside GlobalSyncProvider or _layout) in dev.
 * In production it is a no-op (all branches short-circuit on !__DEV__).
 */

import { useEffect, useRef } from 'react';
import { useGlobalSyncStore } from './useGlobalSyncStore';

const HEALTH_LOG_INTERVAL_MS = 30_000;

export function useGlobalSyncHealthCheck(): void {
  _useHealthCheck();
}

/** Real implementation — logs only in __DEV__. */
function _useHealthCheck(): void {
  const bootstrapStatus   = useGlobalSyncStore(s => s.bootstrapStatus);
  const bootstrapDuration = useGlobalSyncStore(s => s.bootstrapDuration);
  const bootstrapError    = useGlobalSyncStore(s => s.bootstrapError);
  const activeTrips       = useGlobalSyncStore(s => s.activeTrips);
  const alertRows         = useGlobalSyncStore(s => s.alertRows);
  const notifRows         = useGlobalSyncStore(s => s.notificationRows);
  const unreadCount       = useGlobalSyncStore(s => s.notificationUnreadCount);
  const networkStatus     = useGlobalSyncStore(s => s.networkStatus);

  // Log once on bootstrap status change
  const prevStatusRef = useRef<string>('');
  useEffect(() => {
    if (!__DEV__) return;
    if (bootstrapStatus === prevStatusRef.current) return;
    prevStatusRef.current = bootstrapStatus;

    if (bootstrapStatus === 'loading') {
      console.log('[GlobalSync] bootstrapping…');
      return;
    }
    if (bootstrapStatus === 'error') {
      console.warn('[GlobalSync] bootstrap failed:', bootstrapError);
      return;
    }
    if (bootstrapStatus === 'ready') {
      const dur    = bootstrapDuration != null ? `${bootstrapDuration}ms` : 'N/A';
      const alerts = alertRows.filter(a => !a.dismissed).length;
      console.log(
        `[GlobalSync] ✓ ready ${dur} | trips:${activeTrips.length}` +
        ` | alerts:${alerts} | notifs:${unreadCount} unread` +
        ` | network:${networkStatus.total_links} links`,
      );
    }
  }, [bootstrapStatus, bootstrapDuration, bootstrapError, activeTrips.length, alertRows, unreadCount, networkStatus.total_links]);

  // Periodic heartbeat
  useEffect(() => {
    if (!__DEV__) return;
    if (bootstrapStatus !== 'ready') return;

    const id = setInterval(() => {
      const alerts       = alertRows.filter(a => !a.dismissed).length;
      const critAlerts   = alertRows.filter(a => a.severity === 'critical' && !a.dismissed).length;
      const storeBytes   = estimateStoreBytes({
        activeTrips, alertRows, notifRows, networkStatus,
      });

      console.group('[GlobalSync] Heartbeat');
      console.log(`Status:       ${bootstrapStatus} (${bootstrapDuration ?? '?'}ms bootstrap)`);
      console.log(`Active trips: ${activeTrips.length}`);
      console.log(`Alerts:       ${alerts} active (${critAlerts} critical)`);
      console.log(`Notifs:       ${notifRows.length} total, ${unreadCount} unread`);
      console.log(`Network:      ${networkStatus.total_links} links (${networkStatus.client_links} client, ${networkStatus.supplier_links} supplier)`);
      console.log(`Store size:   ~${storeBytes}B`);
      console.groupEnd();
    }, HEALTH_LOG_INTERVAL_MS);

    return () => clearInterval(id);
  }, [
    bootstrapStatus, bootstrapDuration,
    activeTrips, alertRows, notifRows, unreadCount, networkStatus,
  ]);
}

/** Rough byte estimate for the global sync slices (alerts + notifs + network). */
function estimateStoreBytes(slices: {
  activeTrips:   unknown[];
  alertRows:     unknown[];
  notifRows:     unknown[];
  networkStatus: unknown;
}): number {
  try {
    return JSON.stringify(slices).length;
  } catch {
    return -1;
  }
}
