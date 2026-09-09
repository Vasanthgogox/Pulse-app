/**
 * Server-side equivalent of aggregateDrivers.ts's row-building step. The financial
 * numbers (due/paid/pending/trips) come from get_driver_ledger_aggregation
 * (unbounded — no more getTransactionsByOrganization 400/500-row cap); the
 * decoration below (name/status/avatar/left_at formatting) is copied verbatim
 * from aggregateDrivers.ts (lines 96-139) so the rendered row is identical to
 * today's for a driver with the same data. aggregateDrivers.ts itself is left
 * unchanged and still used by connectionGoalsAnalytics.util.ts.
 */
import type { FinancialRowData, AggregationTotals, DriverLike } from './types';
import type { DriverLedgerAggregationRow } from '@/features/finance/services/ledgerAggregationRpc.service';

export function aggregateDriversFromRpc(
  drivers: readonly DriverLike[],
  rpcRows: readonly DriverLedgerAggregationRow[],
): { rows: FinancialRowData[]; totals: AggregationTotals } {
  const byDriverId = new Map(rpcRows.map((r) => [r.driver_id, r]));

  const rows: FinancialRowData[] = [];
  let totalIn = 0;
  let totalOut = 0;

  for (let i = 0; i < drivers.length; i++) {
    const d = drivers[i];
    const id = d.id;
    const financials = byDriverId.get(id);
    const due = financials?.due ?? 0;
    const paid = financials?.paid ?? 0;
    const pending = financials?.pending ?? Math.max(0, due - paid);
    const tripsCount = financials?.trips_count ?? 0;
    totalIn += paid + pending;
    totalOut += pending;

    const leftAt = d.left_at ?? null;
    const isDisconnected = leftAt != null && leftAt !== '';
    const isIntegrated =
      !isDisconnected &&
      (d.tracking_only !== true) &&
      d.user_id != null &&
      d.user_id !== '';
    const leftAtFormatted =
      leftAt != null && leftAt !== ''
        ? (() => {
            try {
              const date = new Date(leftAt);
              return isNaN(date.getTime()) ? leftAt : date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
            } catch {
              return leftAt;
            }
          })()
        : null;
    const displayName = d.name ?? (d as { full_name?: string | null }).full_name ?? undefined;
    const rawAvatar = (d.avatar_url ?? "").trim();
    const rawSeed = (d.avatar_seed ?? "").trim();
    rows.push({
      id,
      name: displayName ?? undefined,
      subline: leftAtFormatted ? `Disconnected · Left on ${leftAtFormatted}` : (d.status ?? undefined),
      status: isDisconnected ? 'DISCONNECTED' : (d.status ?? 'offline'),
      trips: tripsCount,
      paid,
      pending,
      due,
      is_integrated: isIntegrated,
      left_at: leftAt ?? undefined,
      profileImageUrl: rawAvatar || undefined,
      avatarSeed: rawSeed || undefined,
    });
  }

  return {
    rows,
    totals: { totalIn, totalOut },
  };
}
