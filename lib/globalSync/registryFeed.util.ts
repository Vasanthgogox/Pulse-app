import type { GlobalOperationAlert } from '@/lib/globalSync/priorityEngine.util';
import type { SalaryRequestWithDriverRow } from '@/features/drivers/services/salaryRequests.service';
import type { SharedLedgerNotificationRow } from '@/features/finance/services/sharedLedgerNotifications.service';

export type RegistryFeedKind = 'ops' | 'salary' | 'shared';

/** Metronic-style notification filter tabs. */
export type RegistryFilterTab = 'all' | 'driver' | 'trip' | 'payment' | 'archive';

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

export function registryFeedLifecycleTab(filter: RegistryFilterTab): 'active' | 'history' {
  return filter === 'archive' ? 'history' : 'active';
}

export function entryMatchesRegistryFilter(
  entry: RegistryFeedEntry,
  filter: RegistryFilterTab,
): boolean {
  if (filter === 'all' || filter === 'archive') return true;
  if (filter === 'driver') {
    if (entry.kind === 'salary') return true;
    if (entry.kind === 'ops' && entry.ops?.category === 'unassigned_trip') return true;
    return false;
  }
  if (filter === 'trip') {
    if (entry.kind !== 'ops' || !entry.ops) return false;
    const cat = entry.ops.category;
    if (cat === 'unassigned_trip') return false;
    return cat !== 'payment_received' && cat !== 'dispute';
  }
  if (filter === 'payment') {
    if (entry.kind === 'shared') return true;
    if (entry.kind === 'ops' && entry.ops) {
      const cat = entry.ops.category;
      return cat === 'payment_received' || cat === 'dispute';
    }
    return false;
  }
  return true;
}

export function filterRegistryFeed(
  entries: RegistryFeedEntry[],
  filter: RegistryFilterTab,
): RegistryFeedEntry[] {
  if (filter === 'all' || filter === 'archive') return entries;
  return entries.filter((entry) => entryMatchesRegistryFilter(entry, filter));
}
