import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, ExternalLink } from 'lucide-react';
import { PageToolbar } from '@/components/commerce/PageToolbar';
import { useExecution } from '@/context/ExecutionProvider';
import { formatCurrency } from '@/lib/utils';
import { coreIndentUrl, coreTripUrl } from '@/lib/core-navigation';
import {
  indentStatusLabel,
  lifecycleStages,
  orderDeliveryStatusLabel,
  orderProgressLabel,
  orderStatusGlyph,
  primaryStatusLabel,
  commerceTripStatusLabel,
  transportCostStatusLabel,
  tripStatusLabel,
} from '@/lib/commerce-execution-status';
import type { CommerceExecution } from '@/lib/services/execution-visibility.service';

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

export function ExecutionPlanStatusPage() {
  const { planId } = useParams<{ planId: string }>();
  const { commerceExecutions, commerceExecutionsLoaded, commerceExecutionsError } = useExecution();
  const exec = commerceExecutions.find(e => e.executionPlanId === planId);

  if (!commerceExecutionsLoaded) {
    return (
      <div className="container-fluid pb-8">
        <p className="text-2sm text-muted-foreground">Loading fulfillment status…</p>
      </div>
    );
  }

  if (commerceExecutionsError && !exec) {
    return (
      <div className="container-fluid pb-8">
        <p className="text-2sm text-destructive">Could not load fulfillment status from Pulse Core.</p>
        <Link to="/execution" className="text-sm text-primary mt-2 inline-block">← Back to Operations</Link>
      </div>
    );
  }

  if (!exec) {
    return (
      <div className="container-fluid pb-8">
        <p className="font-medium">Fulfillment not found</p>
        <p className="text-2sm text-muted-foreground mt-1">This plan is not in the published Operations list.</p>
        <Link to="/execution" className="text-sm text-primary mt-2 inline-block">← Back to Operations</Link>
      </div>
    );
  }

  return (
    <div className="container-fluid pb-8 max-w-3xl">
      <PageToolbar
        title={exec.planNumber}
        breadcrumb={['Pulse Commerce', 'Operations', exec.planNumber]}
        description="Current fulfillment status — sales delivery is separate from the Core trip."
        showDate={false}
        actions={
          <Link to="/execution" className="inline-flex items-center gap-1.5 text-2sm text-primary font-medium">
            <ArrowLeft className="size-3.5" /> Operations
          </Link>
        }
      />

      <StatusDetail exec={exec} />
    </div>
  );
}

function StatusDetail({ exec }: { exec: CommerceExecution }) {
  const stages = lifecycleStages(exec);
  const progress = orderProgressLabel(exec);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-3xs font-semibold uppercase tracking-wide text-muted-foreground">Current status</p>
            <p className="text-lg font-semibold mt-0.5">{primaryStatusLabel(exec)}</p>
            <p className="text-2xs text-muted-foreground mt-1">
              {exec.orderCount} {exec.orderCount === 1 ? 'order' : 'orders'} · {exec.stopCount} {exec.stopCount === 1 ? 'stop' : 'stops'} · Sales {formatCurrency(exec.totalAmount)}
            </p>
          </div>
        </div>

        <div className="mt-4 flex items-center flex-wrap gap-x-1.5 gap-y-1.5 text-2xs" role="list" aria-label="Fulfillment lifecycle">
          {stages.map((s, i) => (
            <span key={s.stage} className="inline-flex items-center gap-1" role="listitem">
              <span aria-hidden="true">{s.done ? '✓' : s.current ? '●' : '○'}</span>
              <span className={s.done ? 'text-foreground' : s.current ? 'text-primary font-medium' : 'text-muted-foreground'}>
                {s.label}
              </span>
              {i < stages.length - 1 && <span className="text-muted-foreground mx-0.5" aria-hidden="true">→</span>}
            </span>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-5 space-y-3">
        <p className="text-3xs font-semibold uppercase tracking-wide text-muted-foreground">Transportation (Core trip)</p>
        {exec.indent ? (
          <p className="text-2xs">
            Indent{' '}
            <a href={coreIndentUrl(exec.indent.id)} target="_blank" rel="noopener noreferrer" className="font-mono text-primary hover:underline inline-flex items-center gap-1">
              {exec.indent.indentNumber} <ExternalLink className="size-3" />
            </a>
            <span className="text-muted-foreground"> · {indentStatusLabel(exec.indent.status)}</span>
          </p>
        ) : (
          <p className="text-2xs text-muted-foreground">Indent not created yet.</p>
        )}
        {exec.trip ? (
          <p className="text-2xs">
            Trip{' '}
            <a href={coreTripUrl(exec.trip.id)} target="_blank" rel="noopener noreferrer" className="font-mono text-primary hover:underline inline-flex items-center gap-1">
              {exec.trip.tripNumber} <ExternalLink className="size-3" />
            </a>
            <span className="text-muted-foreground"> · {tripStatusLabel(exec.trip.status)}</span>
          </p>
        ) : (
          <p className="text-2xs text-muted-foreground">No trip assigned yet.</p>
        )}
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-2xs">
          <span className="text-muted-foreground">Trip status</span>
          <span className="text-right font-medium">{commerceTripStatusLabel(exec)}</span>
          <span className="text-muted-foreground">Supplier</span>
          <span className="text-right font-medium">{exec.trip?.supplierName ?? 'Not assigned'}</span>
          <span className="text-muted-foreground">Transport cost</span>
          <span className="text-right font-medium">
            {exec.trip ? formatCurrency(exec.trip.supplierRate) : 'Awaiting bid'}
          </span>
          <span className="text-muted-foreground">Award</span>
          <span className="text-right font-medium">{transportCostStatusLabel(exec)}</span>
        </div>
        <p className="text-3xs text-muted-foreground">
          Trip completed does not mean every order was delivered. Delivery below is per order drop stop.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card p-5 space-y-3">
        <p className="text-3xs font-semibold uppercase tracking-wide text-muted-foreground">Delivery (orders)</p>
        {progress ? <p className="text-2xs font-medium">{progress}</p> : (
          <p className="text-2xs text-muted-foreground">No sales orders are linked to this plan. The published indent still exists, but there is nothing to deliver.</p>
        )}
        {exec.orders.length > 0 && (
          <ul className="divide-y divide-border/60 text-2xs">
            {exec.orders.map(o => (
              <li key={o.id} className="flex items-center gap-2 py-2">
                <span aria-hidden="true">{orderStatusGlyph(o)}</span>
                <span className="font-mono">{o.orderNumber}</span>
                <span className="text-muted-foreground truncate flex-1">{o.customerName}</span>
                <span className="tabular-nums">{formatCurrency(o.amount)}</span>
                <span className="text-muted-foreground shrink-0">
                  {exec.trip ? orderDeliveryStatusLabel(o.deliveryStatus) : 'Awaiting Trip'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {exec.stops.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-5 space-y-2">
          <p className="text-3xs font-semibold uppercase tracking-wide text-muted-foreground">Stops</p>
          <ol className="space-y-1.5 text-2xs">
            {exec.stops.map((stop, i) => (
              <li key={stop.id} className="flex items-center gap-2">
                <span className="font-mono text-muted-foreground w-5">{i + 1}</span>
                <span className="font-medium capitalize">{stop.type}</span>
                <ArrowRight className="size-3 text-muted-foreground" />
                <span className="truncate">{stop.label}{stop.city ? ` · ${stop.city}` : ''}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      <p className="text-3xs text-muted-foreground">Published {formatTimestamp(exec.publishedAt)}</p>
    </div>
  );
}
