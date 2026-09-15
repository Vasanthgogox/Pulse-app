import { Link } from 'react-router-dom';
import {
  commerceOpsCardTitle,
  commerceOpsCustomerLine,
  commerceOpsIndentStatus,
  commerceOpsPrimaryPath,
  commerceOpsSourceTags,
  commerceOpsStageLabel,
  commerceOpsStopPath,
  classifyCommerceOpsStage,
} from '@/lib/commerce-ops-hub';
import { formatCurrency } from '@/lib/utils';
import type { CommerceExecution } from '@/lib/services/execution-visibility.service';

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-IN', {
      day: 'numeric',
      month: 'short',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function Tag({ children }: { children: string }) {
  return (
    <span className="text-[10px] font-semibold tracking-wide uppercase border border-[#171A20] rounded px-1 py-0.5 text-[#171A20] bg-white">
      {children}
    </span>
  );
}

export function CommerceOpsTicket({ exec }: { exec: CommerceExecution }) {
  const stage = classifyCommerceOpsStage(exec);
  const stageLabel = commerceOpsStageLabel(exec);
  const tags = exec.indent ? commerceOpsSourceTags(exec.indent.circulationTarget) : [];
  const displayNo = commerceOpsCardTitle(exec);
  const spec = [
    `${exec.orderCount} ${exec.orderCount === 1 ? 'order' : 'orders'}`,
    `${exec.stopCount} ${exec.stopCount === 1 ? 'stop' : 'stops'}`,
  ].join(' · ');
  const supplierRate = exec.trip && exec.trip.supplierRate > 0 ? exec.trip.supplierRate : null;
  const targetRate = exec.indent?.supplierTarget ?? null;
  const bodyHref = commerceOpsPrimaryPath(exec);
  const childTrips = exec.trips?.length ? exec.trips : (exec.trip ? [exec.trip] : []);

  return (
    <article className="rounded-2xl border border-[#171A20] bg-white p-4 flex flex-col min-h-[44px]">
      <Link
        to={bodyHref}
        className="min-w-0 block no-underline text-inherit hover:opacity-90"
        aria-label={`Open ${displayNo}`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-bold tracking-wide text-[#171A20]">{stageLabel}</span>
            <Tag>COMMERCE</Tag>
            {tags.map(t => <Tag key={t}>{t}</Tag>)}
          </div>
        </div>

        <div className="mt-2">
          <p className="font-mono text-sm font-bold text-[#171A20] truncate">{displayNo}</p>
          <p className="text-2xs text-muted-foreground mt-0.5 uppercase tracking-wide">
            {spec}
          </p>
        </div>

        <p className="mt-3 text-sm font-semibold text-[#171A20] leading-snug">
          {commerceOpsStopPath(exec)}
        </p>

        <p className="mt-3 text-sm font-medium text-[#171A20] truncate">{commerceOpsCustomerLine(exec)}</p>
        <p className="mt-1 text-2xs text-muted-foreground">
          {exec.planNumber}
          {childTrips.length > 1 ? ` · ${childTrips.length} trips` : exec.trip ? ` · ${exec.trip.tripNumber}` : ''}
          {' · '}Published {formatTimestamp(exec.publishedAt)}
        </p>

        {exec.orders.length > 0 && (
          <p className="mt-1 text-2xs text-muted-foreground truncate">
            {exec.orders.map(o => o.orderNumber).join(' · ')}
          </p>
        )}

        {stage !== 'indent' && (
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-2xs">
            <span><span className="text-muted-foreground">Supplier </span>{exec.trip?.supplierName ?? '—'}</span>
            <span><span className="text-muted-foreground">Driver </span>{exec.trip?.driverName ?? '—'}</span>
            <span><span className="text-muted-foreground">Vehicle </span>{exec.trip?.vehicleNumber ?? '—'}</span>
          </div>
        )}

        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-2xs">
          {stage === 'indent' && targetRate != null && (
            <span><span className="text-muted-foreground">Supplier target </span>{formatCurrency(targetRate)}</span>
          )}
          {supplierRate != null && (
            <span><span className="text-muted-foreground">Supplier rate </span>{formatCurrency(supplierRate)}</span>
          )}
          {stage === 'indent' && exec.indent && (
            <span className="text-muted-foreground">
              {commerceOpsIndentStatus(exec.indent.status, exec.bidCount)}
              {exec.bidCount > 0 ? ` · ${exec.bidCount} bid${exec.bidCount === 1 ? '' : 's'}` : ''}
            </span>
          )}
        </div>
      </Link>

      <div className="mt-3 pt-3 border-t border-border/70 flex flex-wrap items-center gap-2">
        <Link
          to={`/execution/plan/${exec.executionPlanId}`}
          className="text-2xs font-medium text-primary hover:underline min-h-11 inline-flex items-center"
        >
          Plan
        </Link>
        {exec.indent && (
          <Link
            to={`/execution/indent/${exec.indent.id}`}
            className="text-2xs font-medium text-muted-foreground hover:underline min-h-11 inline-flex items-center"
          >
            Indent
          </Link>
        )}
        {exec.trip && stage !== 'indent' && (
          <Link
            to={`/execution/trip/${exec.trip.id}`}
            className="text-2xs font-medium text-muted-foreground hover:underline min-h-11 inline-flex items-center"
          >
            Trip
          </Link>
        )}
        {exec.indent && stage === 'indent' && (
          <Link
            to={`/execution/indent/${exec.indent.id}/allocate`}
            className="text-2xs font-medium text-primary hover:underline min-h-11 inline-flex items-center"
          >
            Allocate
          </Link>
        )}
        <Link
          to={bodyHref}
          className="ml-auto text-2xs font-medium text-primary hover:underline min-h-11 inline-flex items-center"
        >
          View details →
        </Link>
      </div>
    </article>
  );
}
