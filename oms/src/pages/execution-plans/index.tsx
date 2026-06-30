import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { type ColumnDef } from '@tanstack/react-table';
import {
  CheckCircle2, Clock, GitMerge, LayoutGrid, List, Loader2, Radio, Truck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageToolbar } from '@/components/commerce/PageToolbar';
import { PlanDetailSheet } from '@/components/commerce/PlanDetailSheet';
import {
  CommerceDataTable,
  DataGridColumnHeader,
  MemberCell,
  NumericColumnHeader,
  RowActionsButton,
  commerceTableMeta,
} from '@/components/commerce/CommerceDataTable';
import { StatusDotBadge, type StatusDotTone } from '@/components/commerce/StatusDotBadge';
import { useCommerce } from '@/context/CommerceProvider';
import { formatCurrency, formatDateTime } from '@/lib/utils';
import type { ExecutionPlan, PlanStatus } from '@/types/commerce';
import { cn } from '@/lib/utils';

const PLAN_STATUS: Record<PlanStatus, { label: string; tone: StatusDotTone }> = {
  draft:       { label: 'Draft', tone: 'muted' },
  optimizing:  { label: 'Optimizing', tone: 'warning' },
  ready:       { label: 'Ready', tone: 'info' },
  published:   { label: 'Published', tone: 'info' },
  fulfilled:   { label: 'Fulfilled', tone: 'success' },
  cancelled:   { label: 'Cancelled', tone: 'danger' },
};

function PlanIcon({ plan }: { plan: ExecutionPlan }) {
  const cls = 'size-4 text-[var(--pulse-hero-blue)]';
  if (plan.journey_in_progress) return <Loader2 className={cn(cls, 'animate-spin')} />;
  if (plan.status === 'fulfilled') return <CheckCircle2 className={cls} />;
  return <Clock className={cls} />;
}

function StatTile({
  label, value, sub, accent,
}: {
  label: string; value: string; sub?: string; accent?: boolean;
}) {
  return (
    <div className={cn(
      'pulse-card p-3.5 min-h-[4.5rem]',
      accent && 'pulse-margin-banner',
    )}>
      <p className={cn('text-2xs font-medium uppercase tracking-wide', accent ? 'opacity-80' : 'text-muted-foreground')}>
        {label}
      </p>
      <p className={cn('text-lg font-bold tabular-nums mt-0.5', accent && 'text-[var(--pulse-margin-text)]')}>
        {value}
      </p>
      {sub && <p className="text-3xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

export function ExecutionPlansPage() {
  const { plans } = useCommerce();
  const [view, setView] = useState<'table' | 'grid'>('table');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const published = plans.filter(p => p.status === 'published' || p.status === 'fulfilled').length;
  const inFlight = plans.filter(p => p.journey_in_progress).length;
  const totalValue = plans.reduce((s, p) => s + p.total_amount, 0);

  const columns = useMemo<ColumnDef<ExecutionPlan, unknown>[]>(() => [
    {
      id: 'plan',
      accessorKey: 'plan_number',
      header: ({ column }) => <DataGridColumnHeader column={column} title="Plan" />,
      cell: ({ row }) => (
        <MemberCell
          avatar={<PlanIcon plan={row.original} />}
          title={row.original.plan_number}
          subtitle={`${row.original.total_orders} order${row.original.total_orders !== 1 ? 's' : ''} · ${row.original.constraints.vehicle_type}`}
        />
      ),
      meta: commerceTableMeta.primary,
    },
    {
      id: 'status',
      accessorKey: 'status',
      header: ({ column }) => <DataGridColumnHeader column={column} title="Status" />,
      cell: ({ row }) => {
        const s = PLAN_STATUS[row.original.status];
        return (
          <div className="flex flex-col gap-1 items-start">
            <StatusDotBadge label={s.label} tone={s.tone} />
            {row.original.journey_in_progress && (
              <StatusDotBadge label="In transit" tone="warning" />
            )}
          </div>
        );
      },
      meta: commerceTableMeta.status,
    },
    {
      id: 'amount',
      accessorKey: 'total_amount',
      header: ({ column }) => <NumericColumnHeader column={column} title="Amount" />,
      cell: ({ row }) => (
        <span className="font-medium text-2sm tabular-nums">{formatCurrency(row.original.total_amount)}</span>
      ),
      meta: commerceTableMeta.numeric,
    },
    {
      id: 'weight',
      accessorKey: 'total_weight_kg',
      header: ({ column }) => <NumericColumnHeader column={column} title="Weight" />,
      cell: ({ row }) => (
        <span className="text-2sm text-muted-foreground tabular-nums">{row.original.total_weight_kg.toFixed(1)} kg</span>
      ),
      meta: commerceTableMeta.numeric,
    },
    {
      id: 'score',
      accessorFn: row => row.optimization?.merge_score ?? 0,
      header: ({ column }) => <NumericColumnHeader column={column} title="Score" />,
      cell: ({ row }) => (
        <span className="text-2sm font-medium tabular-nums text-[var(--pulse-hero-blue)]">
          {row.original.optimization?.merge_score ?? '—'}
        </span>
      ),
      meta: commerceTableMeta.numeric,
    },
    {
      id: 'published',
      accessorKey: 'published_at',
      header: ({ column }) => <DataGridColumnHeader column={column} title="Published" />,
      cell: ({ row }) => (
        <span className="text-2xs text-muted-foreground whitespace-nowrap">
          {row.original.published_at ? formatDateTime(row.original.published_at) : '—'}
        </span>
      ),
      meta: commerceTableMeta.text,
    },
    {
      id: 'correlation',
      accessorKey: 'correlation_id',
      header: ({ column }) => <DataGridColumnHeader column={column} title="Correlation" />,
      cell: ({ row }) => row.original.correlation_id ? (
        <span className="inline-flex items-center gap-1 text-3xs font-mono text-[var(--pulse-hero-blue)] max-w-[8rem] truncate">
          <Radio className="size-3 shrink-0" />
          {row.original.correlation_id.slice(0, 8)}…
        </span>
      ) : (
        <span className="text-2xs text-muted-foreground">—</span>
      ),
      meta: commerceTableMeta.text,
    },
    {
      id: 'actions',
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row }) => (
        <div className="flex justify-end">
          <RowActionsButton onClick={() => setSelectedId(row.original.id)} />
        </div>
      ),
      enableSorting: false,
      meta: commerceTableMeta.actions,
    },
  ], []);

  return (
    <div className="container-fluid">
      <PageToolbar
        title="Execution Plans"
        breadcrumb={['Commerce', 'Planning', 'Published Plans']}
        description="Published plans → Gateway → Execution. Trace every lifecycle via correlation ID."
        actions={
          <Button size="sm" asChild>
            <Link to="/execution-plans/build"><GitMerge className="size-3.5" /> New Plan</Link>
          </Button>
        }
      />

      <div className="grid gap-3 pulse-stat-grid commerce-section">
        <StatTile label="Total plans" value={String(plans.length)} sub="All execution plans" />
        <StatTile label="Published" value={String(published)} sub="Gateway handoff" accent />
        <StatTile label="In transit" value={String(inFlight)} sub="Journey in progress" />
        <StatTile label="Plan value" value={formatCurrency(totalValue)} sub="Combined order value" />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <p className="text-2xs text-muted-foreground">
          {plans.length} plan{plans.length !== 1 ? 's' : ''}
        </p>
        <div className="flex items-center gap-0.5 rounded-md border border-border p-0.5">
          <Button size="sm" variant={view === 'table' ? 'primary' : 'ghost'} className="h-7 w-7 p-0" onClick={() => setView('table')}>
            <List className="size-3.5" />
          </Button>
          <Button size="sm" variant={view === 'grid' ? 'primary' : 'ghost'} className="h-7 w-7 p-0" onClick={() => setView('grid')}>
            <LayoutGrid className="size-3.5" />
          </Button>
        </div>
      </div>

      {plans.length === 0 ? (
        <div className="pulse-card border-dashed p-12 text-center">
          <Truck className="size-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="font-medium text-sm">No execution plans yet</p>
          <p className="text-2xs text-muted-foreground mt-1 mb-4">Build and publish a plan from pending orders.</p>
          <Button size="sm" asChild>
            <Link to="/execution-plans/build"><GitMerge className="size-3.5" /> Open Plan Builder</Link>
          </Button>
        </div>
      ) : view === 'table' ? (
        <CommerceDataTable
          data={plans}
          columns={columns}
          enableSelection={false}
          searchPlaceholder="Search plans…"
          getSearchText={p => `${p.plan_number} ${p.status} ${p.correlation_id ?? ''} ${p.constraints.vehicle_type}`}
          getRowId={p => p.id}
          statusFilters={[
            { label: 'Published', value: 'published', match: p => p.status === 'published' },
            { label: 'Ready', value: 'ready', match: p => p.status === 'ready' },
            { label: 'Fulfilled', value: 'fulfilled', match: p => p.status === 'fulfilled' },
            { label: 'In transit', value: 'transit', match: p => Boolean(p.journey_in_progress) },
          ]}
          emptyMessage="No plans match your search"
          onRowClick={p => setSelectedId(p.id)}
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {plans.map(plan => {
            const s = PLAN_STATUS[plan.status];
            return (
              <button
                key={plan.id}
                type="button"
                onClick={() => setSelectedId(plan.id)}
                className="pulse-card p-4 text-left hover:border-[var(--pulse-hero-blue)]/25 hover:bg-[var(--pulse-brand-soft)]/20 transition-all"
              >
                <div className="flex items-start gap-3">
                  <div className="size-10 rounded-lg bg-[var(--pulse-brand-soft)] flex items-center justify-center shrink-0">
                    <PlanIcon plan={plan} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-mono font-bold text-sm text-[var(--pulse-hero-blue)] truncate">{plan.plan_number}</p>
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      <StatusDotBadge label={s.label} tone={s.tone} />
                      {plan.optimization && (
                        <StatusDotBadge label={`Score ${plan.optimization.merge_score}`} tone="info" />
                      )}
                    </div>
                    <p className="text-2xs text-muted-foreground mt-2">
                      {plan.total_orders} orders · {formatCurrency(plan.total_amount)}
                    </p>
                    <p className="text-3xs text-muted-foreground mt-0.5">{plan.constraints.vehicle_type}</p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      <PlanDetailSheet
        planId={selectedId}
        open={!!selectedId}
        onClose={() => setSelectedId(null)}
      />
    </div>
  );
}
