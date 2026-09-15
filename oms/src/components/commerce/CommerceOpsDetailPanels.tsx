import { Link } from 'react-router-dom';
import { formatCurrency } from '@/lib/utils';
import { CommerceIndentHandoffActions } from '@/components/commerce/CommerceIndentHandoff';
import {
  COMMERCE_OPS_RAIL_LABEL,
  COMMERCE_OPS_RAIL_ORDER,
  classifyCommerceOpsStage,
  commerceOpsCardTitle,
  commerceOpsCustomerLine,
  commerceOpsGroupTimeline,
  commerceOpsIndentStatus,
  commerceOpsOrderJourney,
  commerceOpsSourceTags,
  commerceOpsStageLabel,
  commerceOpsStopPath,
  type CommerceOpsTimelineItem,
  type CommerceOpsTimelineMarker,
} from '@/lib/commerce-ops-hub';
import {
  circulationLabel,
  fulfillmentOrderStatusLabel,
  indentStatusLabel,
  transportCostDisplay,
  tripStatusLabel,
} from '@/lib/commerce-execution-status';
import type { CommerceExecution } from '@/lib/services/execution-visibility.service';
import type { CommerceIndentQuote } from '@/lib/services/commerce-ops-detail.service';

function formatTimestamp(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

function sesLabel(status: string | null): string {
  if (!status) return 'Pending';
  if (status === 'completed') return 'Completed';
  if (status === 'arrived') return 'Arrived';
  return status;
}

export type CommerceOpsDetailTab = 'overview' | 'indent' | 'trip' | 'allocate';

export function CommerceOpsDetailNav({
  exec,
  tab,
}: {
  exec: CommerceExecution;
  tab: CommerceOpsDetailTab;
}) {
  const stage = classifyCommerceOpsStage(exec);
  const items: { tab: CommerceOpsDetailTab; to: string; label: string; show: boolean }[] = [
    { tab: 'overview', to: `/execution/plan/${exec.executionPlanId}`, label: 'Plan', show: true },
    {
      tab: 'indent',
      to: exec.indent ? `/execution/indent/${exec.indent.id}` : '',
      label: 'Indent',
      show: Boolean(exec.indent),
    },
    {
      tab: 'trip',
      to: exec.trip ? `/execution/trip/${exec.trip.id}` : '',
      label: 'Trip',
      show: Boolean(exec.trip && stage !== 'indent'),
    },
    {
      tab: 'allocate',
      to: exec.indent ? `/execution/indent/${exec.indent.id}/allocate` : '',
      label: 'ASSET / MARKET',
      show: Boolean(exec.indent && stage === 'indent' && exec.planStatus === 'published'),
    },
  ];

  return (
    <nav className="flex flex-wrap gap-1 mb-4" aria-label="Execution detail">
      {items.filter(i => i.show).map(i => (
        <Link
          key={i.tab}
          to={i.to}
          className={`rounded-full px-3 py-1.5 text-2xs font-semibold min-h-11 inline-flex items-center ${
            tab === i.tab
              ? 'bg-[var(--pulse-hero-blue)] text-white'
              : 'border border-border bg-card text-muted-foreground hover:text-foreground'
          }`}
        >
          {i.label}
        </Link>
      ))}
    </nav>
  );
}

function timelineGlyph(marker: CommerceOpsTimelineMarker): string {
  if (marker === 'done') return '✓';
  if (marker === 'current') return '●';
  return '○';
}

function CommerceOpsTimeline({ items }: { items: CommerceOpsTimelineItem[] }) {
  return (
    <ol className="space-y-0">
      {items.map((item, i) => (
        <li key={item.id} className="flex gap-3">
          <div className="flex flex-col items-center w-5">
            <span
              className={`text-xs leading-5 ${
                item.marker === 'done'
                  ? 'text-primary'
                  : item.marker === 'current'
                    ? 'text-[#171A20]'
                    : 'text-muted-foreground'
              }`}
              aria-hidden="true"
            >
              {timelineGlyph(item.marker)}
            </span>
            {i < items.length - 1 && <span className="w-px flex-1 min-h-3 bg-border" aria-hidden="true" />}
          </div>
          <p className={`text-2xs pb-3 ${item.marker === 'pending' ? 'text-muted-foreground' : 'text-[#171A20] font-medium'}`}>
            {item.label}
          </p>
        </li>
      ))}
    </ol>
  );
}

export function CommerceOpsOverviewPanel({ exec }: { exec: CommerceExecution }) {
  const current = classifyCommerceOpsStage(exec);
  const title = commerceOpsCardTitle(exec);
  const timeline = commerceOpsGroupTimeline(exec);

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-border bg-card p-5">
        <p className="text-3xs font-semibold uppercase tracking-wide text-muted-foreground">Overall status</p>
        <p className="text-lg font-semibold mt-0.5">{commerceOpsStageLabel(exec)}</p>
        <p className="font-mono text-sm font-bold mt-2">{title}</p>
        <p className="text-2xs text-muted-foreground mt-1">
          {exec.planNumber} · {exec.orderCount} orders · {exec.stopCount} stops · Sale {formatCurrency(exec.totalAmount)}
        </p>
        <p className="text-sm font-medium mt-3">{commerceOpsCustomerLine(exec)}</p>
        <p className="text-2xs text-muted-foreground mt-1">{commerceOpsStopPath(exec)}</p>
        <div className="mt-3 flex flex-wrap gap-x-1.5 gap-y-1 text-2xs" role="list">
          {COMMERCE_OPS_RAIL_ORDER.filter(id => id !== 'all').map((id, i, arr) => (
            <span key={id} className="inline-flex items-center gap-1">
              <span className={id === current ? 'text-primary font-semibold' : 'text-muted-foreground'}>
                {COMMERCE_OPS_RAIL_LABEL[id]}
              </span>
              {i < arr.length - 1 && <span className="text-muted-foreground">→</span>}
            </span>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-5">
        <p className="text-3xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Execution timeline</p>
        <CommerceOpsTimeline items={timeline} />
      </section>

      <CommerceOpsOrdersPanel exec={exec} />
      <CommerceOpsStopsPanel exec={exec} />
    </div>
  );
}

export function CommerceOpsIndentPanel({
  exec,
  quotes,
  quotesError,
}: {
  exec: CommerceExecution;
  quotes: CommerceIndentQuote[];
  quotesError?: string | null;
}) {
  const indent = exec.indent;
  if (!indent) {
    return <p className="text-2sm text-muted-foreground">This plan has no indent yet.</p>;
  }
  const tags = commerceOpsSourceTags(indent.circulationTarget);
  const lifecycle = commerceOpsIndentStatus(indent.status, exec.bidCount);
  const sale = indent.clientPrice ?? exec.totalAmount;
  const spec = [indent.vehicleType, indent.weightKg ? `${indent.weightKg} kg` : null, indent.loadType]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-[#171A20] bg-white p-5 space-y-3">
        <div className="flex flex-wrap gap-1.5">
          <span className="text-[11px] font-bold">{lifecycle}</span>
          <span className="text-[10px] font-semibold border border-[#171A20] rounded px-1">COMMERCE</span>
          {tags.map(t => (
            <span key={t} className="text-[10px] font-semibold border border-[#171A20] rounded px-1">{t}</span>
          ))}
        </div>
        <p className="font-mono text-lg font-bold">{indent.indentNumber}</p>
        <p className="text-2xs text-muted-foreground">
          Core status {indentStatusLabel(indent.status)}
          {indent.circulationTarget ? ` · ${circulationLabel(indent.circulationTarget)}` : ''}
        </p>
        <p className="text-sm font-medium">{indent.clientName || commerceOpsCustomerLine(exec)}</p>
        <p className="text-2xs">{indent.pickupArea || '—'} → {indent.dropLocation || '—'}</p>
        {spec ? <p className="text-2xs text-muted-foreground">{spec}</p> : null}
        <p className="text-2xs text-muted-foreground">Pickup {formatTimestamp(indent.pickupDate)}</p>
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-2xs">
          <dt className="text-muted-foreground">Sale value</dt>
          <dd className="text-right font-medium">{formatCurrency(sale)}</dd>
          <dt className="text-muted-foreground">Supplier target rate</dt>
          <dd className="text-right font-medium">{indent.supplierTarget != null ? formatCurrency(indent.supplierTarget) : '—'}</dd>
          <dt className="text-muted-foreground">Assigned supplier rate</dt>
          <dd className="text-right font-medium">
            {indent.assignedSupplierRate != null ? formatCurrency(indent.assignedSupplierRate) : '—'}
          </dd>
          <dt className="text-muted-foreground">Bids</dt>
          <dd className="text-right font-medium">{exec.bidCount}</dd>
          <dt className="text-muted-foreground">Best bid</dt>
          <dd className="text-right font-medium">
            {exec.bestBidAmount != null ? formatCurrency(exec.bestBidAmount) : '—'}
          </dd>
        </dl>
      </section>

      <CommerceIndentHandoffActions exec={exec} indentId={indent.id} showEditForm />

      <section className="rounded-xl border border-border bg-card p-5">
        <p className="text-3xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Live bids</p>
        {quotesError && <p className="text-2xs text-destructive">{quotesError}</p>}
        {!quotesError && quotes.length === 0 && (
          <p className="text-2xs text-muted-foreground">No bids yet — waiting for suppliers.</p>
        )}
        {quotes.length > 0 && (
          <ul className="divide-y divide-border/60 text-2xs">
            {quotes.map(q => (
              <li key={q.id} className="flex items-center gap-2 py-2">
                <span className="truncate flex-1">{q.supplierName ?? 'Supplier'}</span>
                <span className="text-muted-foreground">{q.status}</span>
                <span className="tabular-nums font-medium">
                  {q.amount != null ? formatCurrency(q.amount) : '—'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <CommerceOpsOrdersPanel exec={exec} />
      <CommerceOpsStopsPanel exec={exec} />
    </div>
  );
}

export function CommerceOpsTripPanel({ exec }: { exec: CommerceExecution }) {
  const trip = exec.trip;
  if (!trip) {
    return <p className="text-2sm text-muted-foreground">No trip yet. Allocate the indent to create one.</p>;
  }
  const cost = transportCostDisplay(exec);
  const children = exec.trips?.length ? exec.trips : [trip];

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-[#171A20] bg-white p-5 space-y-3">
        <p className="text-[11px] font-bold">{commerceOpsStageLabel(exec)}</p>
        <p className="font-mono text-lg font-bold">{commerceOpsCardTitle(exec)}</p>
        <p className="text-2xs text-muted-foreground">
          Core trip {trip.tripNumber} · {tripStatusLabel(trip.status)}
          {children.length > 1 ? ` · ${children.length} execution records` : ''}
        </p>
        <p className="text-2xs">{commerceOpsStopPath(exec)}</p>
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-2xs">
          <dt className="text-muted-foreground">Customer</dt>
          <dd className="text-right font-medium truncate">{commerceOpsCustomerLine(exec)}</dd>
          <dt className="text-muted-foreground">Supplier</dt>
          <dd className="text-right font-medium truncate">{trip.supplierName ?? '—'}</dd>
          <dt className="text-muted-foreground">Driver</dt>
          <dd className="text-right font-medium truncate">{trip.driverName ?? '—'}</dd>
          <dt className="text-muted-foreground">Vehicle</dt>
          <dd className="text-right font-medium truncate">{trip.vehicleNumber ?? '—'}</dd>
          <dt className="text-muted-foreground">Sale value</dt>
          <dd className="text-right font-medium">{formatCurrency(exec.totalAmount)}</dd>
          <dt className="text-muted-foreground">Supplier rate</dt>
          <dd className="text-right font-medium">{cost != null ? formatCurrency(cost) : '—'}</dd>
        </dl>
        {exec.indent && (
          <p className="text-2xs text-muted-foreground">Indent {exec.indent.indentNumber}</p>
        )}
      </section>
      {children.length > 1 && (
        <section className="rounded-xl border border-border bg-card p-5">
          <p className="text-3xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Execution records
          </p>
          <ul className="divide-y divide-border/60 text-2xs">
            {children.map(t => (
              <li key={t.id} className="flex items-center gap-2 py-2">
                <span className="font-mono font-medium">{t.tripNumber}</span>
                <span className="text-muted-foreground truncate flex-1">{tripStatusLabel(t.status)}</span>
                <span className="truncate">{t.driverName ?? '—'}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <CommerceOpsStopsPanel exec={exec} />
      <CommerceOpsOrdersPanel exec={exec} />
    </div>
  );
}

function CommerceOpsOrdersPanel({ exec }: { exec: CommerceExecution }) {
  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <p className="text-3xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Orders</p>
      {exec.orders.length === 0 ? (
        <p className="text-2xs text-muted-foreground">No sales orders linked.</p>
      ) : (
        <ul className="space-y-3">
          {exec.orders.map(o => {
            const journey = commerceOpsOrderJourney(o);
            return (
              <li key={o.id} className="border-b border-border/60 last:border-0 pb-3 last:pb-0">
                <div className="flex items-center gap-2 text-2xs mb-2">
                  <span className="font-mono font-medium">{o.orderNumber}</span>
                  <span className="text-muted-foreground truncate flex-1">{o.customerName}</span>
                  <span className="tabular-nums">{formatCurrency(o.amount)}</span>
                  <span className="text-muted-foreground shrink-0">{fulfillmentOrderStatusLabel(exec, o)}</span>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-2xs text-muted-foreground">
                  {journey.map(step => (
                    <span key={step.id}>
                      <span aria-hidden="true">{timelineGlyph(step.marker)} </span>
                      {step.label}
                    </span>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function CommerceOpsStopsPanel({ exec }: { exec: CommerceExecution }) {
  if (!exec.stops.length) return null;
  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <p className="text-3xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Stops</p>
      <ol className="space-y-1.5 text-2xs">
        {exec.stops.map((stop, i) => (
          <li key={stop.id} className="flex items-center gap-2">
            <span className="font-mono text-muted-foreground w-5">{i + 1}</span>
            <span className="font-medium capitalize">{stop.type}</span>
            <span className="truncate flex-1">{stop.label}{stop.city ? ` · ${stop.city}` : ''}</span>
            <span className="text-muted-foreground">{sesLabel(stop.executionStatus)}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
