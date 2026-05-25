/**
 * Alert Registry bell — WhatsApp bootstrap & patch (no tab-scoped DB polls).
 *
 * Flow: `GlobalSyncProvider.bootstrap()` hydrates slices once → Realtime patches store
 * → UI actions patch local state first → DB RPC/table write → Realtime confirms.
 */
import { useMemo } from 'react';
import { useGlobalSync } from '@/lib/globalSync/GlobalSyncContext';
import { useGlobalSyncStore } from '@/lib/globalSync/useGlobalSyncStore';
import type { SalaryRequestWithDriverRow } from '@/features/drivers/services/salaryRequests.service';
import type { SharedLedgerNotificationRow } from '@/services/sharedLedgerNotificationsService';

export function selectRegistryBellCount(
  salaryRows: SalaryRequestWithDriverRow[],
  sharedRows: SharedLedgerNotificationRow[],
): number {
  const pendingSalary = salaryRows.filter((r) => r.status === 'pending').length;
  const openShared = sharedRows.filter((n) => n.status === 'open').length;
  return pendingSalary + openShared;
}

export function useAlertRegistryNotifications(orgId: string | null) {
  const { refresh } = useGlobalSync();
  const salaryRequestRows = useGlobalSyncStore((s) => s.salaryRequestRows);
  const sharedLedgerRows = useGlobalSyncStore((s) => s.sharedLedgerRows);
  const bootstrapStatus = useGlobalSyncStore((s) => s.bootstrapStatus);
  const rejectSalaryRequest = useGlobalSyncStore((s) => s.rejectSalaryRequest);
  const markSharedLedgerRead = useGlobalSyncStore((s) => s.markSharedLedgerRead);

  const activeSalaryRequests = useMemo(
    () => salaryRequestRows.filter((r) => r.status === 'pending'),
    [salaryRequestRows],
  );
  const historySalaryRequests = useMemo(
    () => salaryRequestRows.filter((r) => r.status !== 'pending'),
    [salaryRequestRows],
  );
  const activeSharedNotifications = useMemo(
    () => sharedLedgerRows.filter((n) => n.status === 'open'),
    [sharedLedgerRows],
  );
  const historySharedNotifications = useMemo(
    () => sharedLedgerRows.filter((n) => n.status !== 'open'),
    [sharedLedgerRows],
  );
  const notificationCount = useMemo(
    () => selectRegistryBellCount(salaryRequestRows, sharedLedgerRows),
    [salaryRequestRows, sharedLedgerRows],
  );

  return {
    bootstrapStatus,
    notificationCount,
    activeSalaryRequests,
    historySalaryRequests,
    activeSharedNotifications,
    historySharedNotifications,
    refreshRegistry: () => {
      if (!orgId) return;
      void useGlobalSyncStore.getState().bootstrap(orgId, { force: true });
    },
    refresh,
    rejectSalaryRequest: (requestId: string) => {
      if (!orgId) return Promise.resolve({ error: new Error('no_org') });
      return rejectSalaryRequest(requestId, orgId);
    },
    markSharedLedgerRead: (notificationId: string) => {
      if (!orgId) return Promise.resolve({ error: new Error('no_org') });
      return markSharedLedgerRead(notificationId, orgId);
    },
  };
}
