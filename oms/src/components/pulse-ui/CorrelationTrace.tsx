import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Circle, Loader2, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getCorrelationTrace, subscribeObservatory } from '@/lib/pulse-observatory';
import type { ObservatoryRecord } from '@/types/observatory';

interface CorrelationTraceProps {
  correlationId: string;
  className?:    string;
  compact?:      boolean;
}

const ACTION_ORDER = [
  'POST',
  'ExecutionPlanPublished',
  'ExecutionJobReceived',
  'IndentCreated',
  'DriverAssigned',
  'TripStarted',
  'StopArrived',
  'PickupCompleted',
  'DropCompleted',
  'PODUploaded',
  'TripCompleted',
  'SettlementCompleted',
  'InvoiceGenerated',
  'commerce_orders_fulfilled',
];

function sortTrace(records: ObservatoryRecord[]): ObservatoryRecord[] {
  return [...records].sort((a, b) => {
    const ai = ACTION_ORDER.findIndex(k => a.action.includes(k));
    const bi = ACTION_ORDER.findIndex(k => b.action.includes(k));
    if (ai !== -1 && bi !== -1 && ai !== bi) return ai - bi;
    return a.occurredAt.localeCompare(b.occurredAt);
  });
}

function StatusIcon({ status }: { status: ObservatoryRecord['status'] }) {
  if (status === 'success') return <CheckCircle2 className="size-4 text-[var(--pulse-success-text)] shrink-0" />;
  if (status === 'failure') return <XCircle className="size-4 text-red-500 shrink-0" />;
  if (status === 'pending' || status === 'retrying') return <Loader2 className="size-4 text-primary animate-spin shrink-0" />;
  return <Circle className="size-4 text-muted-foreground shrink-0" />;
}

export function CorrelationTrace({ correlationId, className, compact }: CorrelationTraceProps) {
  const [, tick] = useState(0);
  useEffect(() => subscribeObservatory(() => tick(n => n + 1)), []);

  const trace = useMemo(() => sortTrace(getCorrelationTrace(correlationId)), [correlationId, tick]);

  if (trace.length === 0) {
    return (
      <p className={cn('text-2sm text-muted-foreground', className)}>
        No trace yet — publish the plan to start the lifecycle.
      </p>
    );
  }

  return (
    <div className={cn('space-y-0', className)}>
      <div className="flex items-center gap-2 mb-3 px-1">
        <span className="text-2xs font-medium text-muted-foreground uppercase tracking-wide">Correlation</span>
        <code className="text-2xs font-mono bg-muted px-2 py-0.5 rounded truncate">{correlationId}</code>
      </div>
      <ol className="relative border-l border-border ml-2">
        {trace.map((step, i) => (
          <li key={step.id} className={cn('relative pl-6', compact ? 'pb-3' : 'pb-4')}>
            <span className="absolute -left-[5px] top-1 size-2.5 rounded-full bg-background border-2 border-primary" />
            <div className="flex items-start gap-2">
              <StatusIcon status={step.status} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium leading-tight">{step.action}</p>
                <p className="text-2xs text-muted-foreground mt-0.5">
                  {step.service}
                  {step.latencyMs != null && ` · ${step.latencyMs}ms`}
                  {' · '}
                  {new Date(step.occurredAt).toLocaleTimeString()}
                </p>
                {!compact && step.payload != null && (
                  <pre className="text-[9px] font-mono mt-1 text-muted-foreground overflow-x-auto max-h-16">
                    {JSON.stringify(step.payload)}
                  </pre>
                )}
              </div>
            </div>
            {i < trace.length - 1 && !compact && (
              <div className="absolute left-[-1px] top-5 bottom-0 w-px bg-border" />
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
