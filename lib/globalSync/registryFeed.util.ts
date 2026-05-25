import type { GlobalOperationAlert } from '@/lib/globalSync/priorityEngine.util';
import type { SalaryRequestWithDriverRow } from '@/features/drivers/services/salaryRequests.service';
import type { SharedLedgerNotificationRow } from '@/features/finance/services/sharedLedgerNotifications.service';

export type RegistryFeedKind = 'ops' | 'salary' | 'shared';

export type RegistryFeedEntry = {
  id: string;
  kind: RegistryFeedKind;
  sortKey: number;
  createdAt: string;
  ops?: GlobalOperationAlert;
  salary?: SalaryRequestWithDriverRow;
  shared?: SharedLedgerNotificationRow;
};

function parseSortMs(iso: string | null | undefined, fallbackWeight = 0): number {
  const ts = iso ? new Date(iso).getTime() : NaN;
  if (!Number.isNaN(ts)) return ts;
  return Date.now() - fallbackWeight;
}

export function buildRegistryFeed(input: {
  tab: 'active' | 'history';
  opsAlerts: GlobalOperationAlert[];
  activeSalary: SalaryRequestWithDriverRow[];
  historySalary: SalaryRequestWithDriverRow[];
  activeShared: SharedLedgerNotificationRow[];
  historyShared: SharedLedgerNotificationRow[];
}): RegistryFeedEntry[] {
  const entries: RegistryFeedEntry[] = [];

  if (input.tab === 'active') {
    for (const ops of input.opsAlerts) {
      entries.push({
        id: `ops:${ops.id}`,
        kind: 'ops',
        sortKey: parseSortMs(ops.created_at) + ops.priority_weight * 1_000,
        createdAt: ops.created_at,
        ops,
      });
    }
    for (const salary of input.activeSalary) {
      entries.push({
        id: `salary:${salary.id}`,
        kind: 'salary',
        sortKey: parseSortMs(salary.created_at, 50_000),
        createdAt: salary.created_at,
        salary,
      });
    }
    for (const shared of input.activeShared) {
      entries.push({
        id: `shared:${shared.id}`,
        kind: 'shared',
        sortKey: parseSortMs(shared.created_at, 40_000),
        createdAt: shared.created_at,
        shared,
      });
    }
  } else {
    for (const salary of input.historySalary) {
      entries.push({
        id: `salary:${salary.id}`,
        kind: 'salary',
        sortKey: parseSortMs(salary.created_at),
        createdAt: salary.created_at,
        salary,
      });
    }
    for (const shared of input.historyShared) {
      entries.push({
        id: `shared:${shared.id}`,
        kind: 'shared',
        sortKey: parseSortMs(shared.created_at),
        createdAt: shared.created_at,
        shared,
      });
    }
  }

  return entries.sort((a, b) => b.sortKey - a.sortKey);
}
