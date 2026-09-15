import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { GitMerge } from 'lucide-react';
import { PageToolbar } from '@/components/commerce/PageToolbar';
import { CommerceOpsStageRail } from '@/components/commerce/CommerceOpsStageRail';
import { CommerceOpsTicket } from '@/components/commerce/CommerceOpsTicket';
import { Button } from '@/components/ui/button';
import { useExecution } from '@/context/ExecutionProvider';
import {
  countCommerceOpsByStage,
  filterCommerceOpsByStage,
  commerceOpsMatchesSearch,
  commerceOpsGroupKey,
  type CommerceOpsRailId,
} from '@/lib/commerce-ops-hub';
import { formatCurrency } from '@/lib/utils';

export function ExecutionDashboardPage() {
  const { commerceExecutions, commerceExecutionsLoaded, commerceExecutionsError } = useExecution();
  const [stage, setStage] = useState<CommerceOpsRailId>('all');
  const [search, setSearch] = useState('');

  const searched = useMemo(
    () => commerceExecutions.filter(e => commerceOpsMatchesSearch(e, search)),
    [commerceExecutions, search],
  );
  const counts = useMemo(() => countCommerceOpsByStage(searched), [searched]);
  const visible = useMemo(
    () => filterCommerceOpsByStage(searched, stage),
    [searched, stage],
  );
  const saleValue = searched.reduce((sum, e) => sum + e.totalAmount, 0);

  return (
    <div className="container-fluid pb-8">
      <PageToolbar
        title="Commerce Operations"
        breadcrumb={['Pulse Commerce', 'Operations']}
        description="One card per indent / execution group. Plan, indent, and trip are views of the same load — not separate workflows."
        actions={
          <Button asChild size="sm">
            <Link to="/execution-plans/build">
              <GitMerge className="size-3.5" /> Merge / Plan orders
            </Link>
          </Button>
        }
      />

      <div className="flex flex-col gap-3 mb-4">
        <input
          type="search"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search plan, indent, trip, order, customer…"
          aria-label="Search operations"
          className="w-full max-w-xl rounded-lg border border-border bg-card px-3 py-2 text-2sm min-h-11"
        />
        <CommerceOpsStageRail active={stage} counts={counts} onChange={setStage} />
        <p className="text-2xs text-muted-foreground">
          {searched.length} execution group{searched.length === 1 ? '' : 's'} · Sale value {formatCurrency(saleValue)}
        </p>
      </div>

      {commerceExecutionsError && (
        <div role="alert" className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 mb-6 text-2sm text-destructive">
          Could not load the latest fulfillment status from Pulse Core. This is a read failure, not a data problem — try refreshing.
        </div>
      )}

      {visible.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {visible.map(exec => (
            <CommerceOpsTicket key={commerceOpsGroupKey(exec)} exec={exec} />
          ))}
        </div>
      )}

      {commerceExecutionsLoaded && searched.length === 0 && !commerceExecutionsError && (
        <div className="rounded-xl border border-dashed border-border p-10 text-center">
          <p className="font-medium">No active fulfillment yet</p>
          <p className="text-2sm text-muted-foreground mt-1">
            Select orders in Orders, merge them in Plan Builder, and publish. The indent appears here on the INDENT rail until Core allocates a trip.
          </p>
          <Link to="/execution-plans/build" className="inline-block mt-4 text-sm text-primary font-medium">
            Open Plan Builder →
          </Link>
        </div>
      )}

      {commerceExecutionsLoaded && searched.length > 0 && visible.length === 0 && (
        <p className="text-2sm text-muted-foreground py-8">No executions in this stage.</p>
      )}
    </div>
  );
}
