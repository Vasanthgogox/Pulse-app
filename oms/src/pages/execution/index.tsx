import { Link } from 'react-router-dom';
import { ArrowRight, ExternalLink, Radio, Truck, User } from 'lucide-react';
import { PageToolbar } from '@/components/commerce/PageToolbar';
import { KpiCard, LottieIcon, RouteTimeline, StatusBadge } from '@/components/pulse-ui';
import { useExecution } from '@/context/ExecutionProvider';
import { formatCurrency } from '@/lib/utils';
import { coreIndentUrl, coreTripUrl } from '@/lib/core-navigation';
import {
  isTripDelivered, isTripInTransit, lifecycleStages, orderDeliveryStatusLabel,
  orderProgressLabel, orderStatusGlyph, primaryStatusLabel, transportCostStatusLabel,
} from '@/lib/commerce-execution-status';
import type { CommerceExecution } from '@/lib/services/execution-visibility.service';

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

function CommerceTag() {
  return (
    <span className="text-3xs font-sans font-semibold tracking-wide text-muted-foreground border border-border rounded px-1 py-0.5 shrink-0">
      COMMERCE
    </span>
  );
}

function StopsPreview({ exec }: { exec: CommerceExecution }) {
  if (!exec.stops.length) return null;
  const pickups = exec.stops.filter(s => s.type === 'pickup').map(s => s.label);
  const drops = exec.stops.filter(s => s.type === 'drop').map(s => s.label);
  if (!pickups.length && !drops.length) return null;
  return (
    <p className="text-3xs text-muted-foreground truncate">
      {pickups.join(', ') || '—'} <ArrowRight className="inline size-2.5 mx-0.5" /> {drops.join(', ') || '—'}
    </p>
  );
}

/** Sales value (Commerce) vs. transport cost (Core) are distinct concepts — never derive one from the other. */
function TransportationSection({ exec }: { exec: CommerceExecution }) {
  const supplierName = exec.trip?.supplierName ?? null;
  return (
    <div className="text-2xs">
      <p className="text-3xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Transportation</p>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1">
        <span className="text-muted-foreground">Supplier</span>
        <span className="text-right font-medium truncate">{supplierName ?? 'Not assigned'}</span>

        {exec.trip ? (
          <>
            <span className="text-muted-foreground">Transport Cost</span>
            <span className="text-right font-medium">{formatCurrency(exec.trip.supplierRate)}</span>
          </>
        ) : (
          <>
            <span className="text-muted-foreground">Transport Cost</span>
            <span className="text-right font-medium text-muted-foreground">Awaiting Bid</span>
            {exec.indent?.supplierTarget != null && (
              <>
                <span className="text-muted-foreground">Transport Target</span>
                <span className="text-right font-medium">{formatCurrency(exec.indent.supplierTarget)}</span>
              </>
            )}
          </>
        )}

        <span className="text-muted-foreground">Status</span>
        <span className="text-right font-medium">{transportCostStatusLabel(exec)}</span>
      </div>
    </div>
  );
}

function DeliverySection({ exec }: { exec: CommerceExecution }) {
  const progress = orderProgressLabel(exec);
  if (!progress) return null;
  return (
    <div className="text-2xs">
      <p className="text-3xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Delivery</p>
      <p className="font-medium">{progress}</p>
    </div>
  );
}

function OrdersList({ exec }: { exec: CommerceExecution }) {
  if (!exec.orders.length) return null;
  return (
    <div className="text-2xs">
      <p className="text-3xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Orders</p>
      <ul className="divide-y divide-border/60">
        {exec.orders.map(o => (
          <li key={o.id} className="flex items-center gap-2 py-1">
            <span aria-hidden="true">{orderStatusGlyph(o)}</span>
            <span className="font-mono">{o.orderNumber}</span>
            <span className="text-muted-foreground truncate flex-1">{o.customerName}</span>
            <span className="text-muted-foreground">
              {exec.trip ? orderDeliveryStatusLabel(o.deliveryStatus) : 'Awaiting Trip'}
              <span className="sr-only"> delivery status</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ExecutionCard({ exec }: { exec: CommerceExecution }) {
  const stages = lifecycleStages(exec);

  return (
    <div className="rounded-xl border border-border bg-card p-5 flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono font-bold text-sm">{exec.planNumber}</p>
          <p className="text-2xs text-muted-foreground mt-0.5">
            {exec.orderCount} {exec.orderCount === 1 ? 'Order' : 'Orders'} · {exec.stopCount} {exec.stopCount === 1 ? 'Stop' : 'Stops'}
          </p>
          <p className="text-2xs text-muted-foreground mt-0.5">Sales Value <span className="font-medium text-foreground">{formatCurrency(exec.totalAmount)}</span></p>
          <StopsPreview exec={exec} />
        </div>
        <span className="text-2xs font-medium px-2.5 py-1 rounded-full bg-primary/10 text-primary shrink-0">
          {primaryStatusLabel(exec)}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-2sm">
        {exec.indent ? (
          <a
            href={coreIndentUrl(exec.indent.id)}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Open indent ${exec.indent.indentNumber} in Pulse Core`}
            className="inline-flex items-center gap-1.5 font-mono text-primary hover:underline"
          >
            {exec.indent.indentNumber}
            <CommerceTag />
            <ExternalLink className="size-3" aria-hidden="true" />
          </a>
        ) : (
          <span className="text-2xs text-muted-foreground">Preparing indent…</span>
        )}

        {exec.trip ? (
          <a
            href={coreTripUrl(exec.trip.id)}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Open trip ${exec.trip.tripNumber} in Pulse Core`}
            className="inline-flex items-center gap-1.5 font-mono text-primary hover:underline"
          >
            {exec.trip.tripNumber}
            <CommerceTag />
            <ExternalLink className="size-3" aria-hidden="true" />
          </a>
        ) : exec.indent ? (
          <span className="text-2xs text-muted-foreground">Awaiting trip assignment</span>
        ) : null}
      </div>

      <div className="flex items-center flex-wrap gap-x-1.5 gap-y-1.5 text-2xs" role="list" aria-label="Fulfillment lifecycle">
        {stages.map((s, i) => (
          <span key={s.stage} className="inline-flex items-center gap-1" role="listitem">
            <span aria-hidden="true">{s.done ? '✓' : s.current ? '●' : '○'}</span>
            <span className={s.done ? 'text-foreground' : s.current ? 'text-primary font-medium' : 'text-muted-foreground'}>
              {s.label}
              <span className="sr-only">{s.done ? ' (complete)' : s.current ? ' (current)' : ' (pending)'}</span>
            </span>
            {i < stages.length - 1 && <span className="text-muted-foreground mx-0.5" aria-hidden="true">→</span>}
          </span>
        ))}
      </div>

      <div className="border-t border-border/60 pt-3">
        <TransportationSection exec={exec} />
      </div>

      {orderProgressLabel(exec) && (
        <div className="border-t border-border/60 pt-3">
          <DeliverySection exec={exec} />
        </div>
      )}

      {exec.orders.length > 0 && (
        <div className="border-t border-border/60 pt-3">
          <OrdersList exec={exec} />
        </div>
      )}

      <div className="flex items-center justify-between text-3xs text-muted-foreground pt-2 border-t border-border/60">
        <span>Published {formatTimestamp(exec.publishedAt)}</span>
        {exec.correlationId && (
          <span className="font-mono flex items-center gap-1" title="Correlation ID — technical/debug reference">
            <Radio className="size-2.5" aria-hidden="true" />{exec.correlationId}
          </span>
        )}
      </div>
    </div>
  );
}

export function ExecutionDashboardPage() {
  const { activeJobs, commerceExecutions, commerceExecutionsLoaded, commerceExecutionsError } = useExecution();

  const awaitingTrip = commerceExecutions.filter(e => !e.trip).length;
  const inTransit = commerceExecutions.filter(e => e.trip && isTripInTransit(e.trip.status)).length;
  const delivered = commerceExecutions.filter(e => e.trip && isTripDelivered(e.trip.status)).length;
  const totalValue = commerceExecutions.reduce((sum, e) => sum + e.totalAmount, 0);

  const hasAnyContent = commerceExecutions.length > 0 || activeJobs.length > 0;

  return (
    <div className="container-fluid pb-8">
      <PageToolbar
        title="Commerce Operations"
        breadcrumb={['Pulse Commerce', 'Operations']}
        description="Orders merged into execution plans, posted as Indents, and moved as Trips in Pulse Core"
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        <KpiCard label="Awaiting Trip" value={String(awaitingTrip)} lottie="logistics" />
        <KpiCard label="In Transit" value={String(inTransit)} lottie="delivery" />
        <KpiCard label="Delivered" value={String(delivered)} lottie="success" />
        <KpiCard label="Order Value" value={formatCurrency(totalValue)} lottie="success" />
      </div>

      {commerceExecutionsError && (
        <div role="alert" className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 mb-6 text-2sm text-destructive">
          Could not load the latest fulfillment status from Pulse Core. This is a read failure, not a data problem — try refreshing.
        </div>
      )}

      {commerceExecutions.length > 0 && (
        <section className="mb-6">
          <h2 className="font-semibold mb-3 flex items-center gap-2">
            <LottieIcon name="planning" size={32} />
            Fulfillment
          </h2>
          <div className="space-y-3">
            {commerceExecutions.map(exec => (
              <ExecutionCard key={exec.executionPlanId} exec={exec} />
            ))}
          </div>
        </section>
      )}

      {activeJobs.length > 0 && (
        <section className="mb-6">
          <h2 className="font-semibold mb-3">Active trips (local demo)</h2>
          <div className="grid gap-3 lg:grid-cols-2">
            {activeJobs.map(job => (
              <div key={job.id} className="rounded-xl border border-border bg-card p-5 shadow-none">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <p className="font-mono font-semibold">{job.planNumber}</p>
                    <p className="text-2sm text-muted-foreground flex items-center gap-2 mt-1">
                      <User className="size-3.5" />{job.driverName}
                      <Truck className="size-3.5 ml-2" />{job.vehicleLabel}
                    </p>
                  </div>
                  <StatusBadge status={job.status} />
                </div>
                <RouteTimeline
                  stops={job.stops.map(s => ({
                    stop_id: s.stopId,
                    label: s.label,
                    type: s.type,
                    address: { line1: '', city: s.city, state: '', pincode: '' },
                    contact_name: '',
                    contact_phone: '',
                    pod_required: s.podRequired,
                  }))}
                  sequence={job.stops.map(s => s.stopId)}
                />
                <Link
                  to={`/execution/driver/${job.id}`}
                  className="mt-4 inline-flex items-center gap-2 text-sm text-primary font-medium"
                >
                  Open driver view <ArrowRight className="size-4" />
                </Link>
              </div>
            ))}
          </div>
        </section>
      )}

      {commerceExecutionsLoaded && !hasAnyContent && !commerceExecutionsError && (
        <div className="rounded-xl border border-dashed border-border p-10 text-center">
          <LottieIcon name="logistics" size={80} className="mx-auto mb-4" />
          <p className="font-medium">No active fulfillment yet</p>
          <p className="text-2sm text-muted-foreground mt-1">Publish an execution plan from Commerce Workspace to begin fulfilling orders.</p>
          <Link to="/execution-plans/build" className="inline-block mt-4 text-sm text-primary font-medium">Go to Plan Builder →</Link>
        </div>
      )}
    </div>
  );
}
