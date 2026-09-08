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

export function selectRegistryBellCount(
  salaryRows: SalaryRequestWithDriverRow[],
): number {
  return salaryRows.filter((r) => r.status === 'pending').length;
}

export function useAlertRegistryNotifications(orgId: string | null) {
  const { refresh } = useGlobalSync();
  const salaryRequestRows = useGlobalSyncStore((s) => s.salaryRequestRows);
  const bootstrapStatus = useGlobalSyncStore((s) => s.bootstrapStatus);
  const rejectSalaryRequest = useGlobalSyncStore((s) => s.rejectSalaryRequest);

  const activeSalaryRequests = useMemo(
    () => salaryRequestRows.filter((r) => r.status === 'pending'),
    [salaryRequestRows],
  );
  const historySalaryRequests = useMemo(
    () => salaryRequestRows.filter((r) => r.status !== 'pending'),
    [salaryRequestRows],
  );
  const notificationCount = useMemo(
    () => selectRegistryBellCount(salaryRequestRows),
    [salaryRequestRows],
  );

  return {
    bootstrapStatus,
    notificationCount,
    activeSalaryRequests,
    historySalaryRequests,
    refreshRegistry: () => {
      if (!orgId) return;
      void useGlobalSyncStore.getState().bootstrap(orgId, { force: true });
    },
    refresh,
    rejectSalaryRequest: (requestId: string) => {
      if (!orgId) return Promise.resolve({ error: new Error('no_org') });
      return rejectSalaryRequest(requestId, orgId);
    },
  };
}
