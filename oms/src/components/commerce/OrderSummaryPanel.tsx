import { Package, Scale, Sparkles } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { cn } from '@/lib/utils';
import type { Order } from '@/types/commerce';

interface SummaryLine {
  label:             string;
  amount:            number;
  suffix?:           string;
  formatAsCurrency?: boolean;
}

export type OrderSummaryMode = 'selection' | 'pending' | 'browse';

interface OrderSummaryPanelProps {
  title?:         string;
  lines:          SummaryLine[];
  total:          number;
  footer?:        React.ReactNode;
  destination?:   string;
  hint?:          string;
  className?:     string;
  previewOrders?: Order[];
  mode?:          OrderSummaryMode;
  totalWeightKg?: number;
  vehicleCapacityKg?: number;
}

const MODE_COPY: Record<OrderSummaryMode, { icon: typeof Package; accent: string }> = {
  selection: { icon: Sparkles, accent: 'text-[var(--pulse-hero-blue)]' },
  pending:   { icon: Package, accent: 'text-[var(--pulse-hero-blue)]' },
  browse:    { icon: Package, accent: 'text-muted-foreground' },
};

export function OrderSummaryPanel({
  title = 'Order Summary',
  lines,
  total,
  footer,
  destination,
  hint,
  className,
  previewOrders = [],
  mode = 'browse',
  totalWeightKg = 0,
  vehicleCapacityKg = 750,
}: OrderSummaryPanelProps) {
  const modeMeta = MODE_COPY[mode];
  const ModeIcon = modeMeta.icon;
  const utilization = vehicleCapacityKg > 0
    ? Math.min(100, Math.round((totalWeightKg / vehicleCapacityKg) * 100))
    : 0;
  const previewSlice = previewOrders;

  function formatLineAmount(line: SummaryLine) {
    if (line.formatAsCurrency === false) {
      return `${line.amount.toFixed(1)}${line.suffix ? ` ${line.suffix}` : ''}`;
    }
    return formatCurrency(line.amount);
  }

  return (
    <div className={cn('pulse-card overflow-hidden flex flex-col h-auto', className)}>
      <div className="px-4 pt-4 pb-3 bg-[var(--pulse-brand-soft)]/35">
        <div className="flex items-start gap-2.5">
          <div className="size-9 shrink-0 rounded-lg bg-card border border-border/60 flex items-center justify-center">
            <ModeIcon className={cn('size-4', modeMeta.accent)} />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-[var(--pulse-hero-blue)]">{title}</h3>
            {destination && (
              <p className="text-2sm text-muted-foreground mt-0.5 leading-snug">{destination}</p>
            )}
          </div>
        </div>

        {hint && (
          <p className="text-2xs text-[var(--pulse-warning-text)] mt-2.5 rounded-md bg-[var(--pulse-warning-bg)]/60 px-2.5 py-1.5">
            {hint}
          </p>
        )}

        {previewOrders.length > 0 && (
          <div className="mt-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-3xs font-semibold uppercase tracking-wide text-muted-foreground">
                Plan preview
              </span>
              <span className="text-3xs text-muted-foreground tabular-nums">
                {previewOrders.length} order{previewOrders.length !== 1 ? 's' : ''}
              </span>
            </div>
            <ul className="space-y-1.5 max-h-[16rem] overflow-y-auto pe-0.5">
              {previewSlice.map(order => (
                <li
                  key={order.id}
                  className="flex items-center gap-2 rounded-md border border-border/70 bg-card/90 px-2.5 py-1.5"
                >
                  <span className="size-7 shrink-0 rounded-full bg-[var(--pulse-brand-soft)] flex items-center justify-center text-3xs font-bold text-[var(--pulse-hero-blue)]">
                    {order.order_number.slice(-2)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-2xs font-medium truncate">{order.order_number}</p>
                    <p className="text-3xs text-muted-foreground truncate">{order.customer_name}</p>
                  </div>
                  <span className="text-2xs font-medium tabular-nums shrink-0">
                    {formatCurrency(order.total_amount)}
                  </span>
                </li>
              ))}
            </ul>
            {totalWeightKg > 0 && (
              <div className="pt-1">
                <div className="flex items-center justify-between text-3xs text-muted-foreground mb-1">
                  <span className="inline-flex items-center gap-1">
                    <Scale className="size-3" /> Load estimate
                  </span>
                  <span className="tabular-nums">{totalWeightKg.toFixed(1)} / {vehicleCapacityKg} kg</span>
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all',
                      utilization >= 85 ? 'bg-[var(--pulse-success-dot)]' : 'bg-[var(--pulse-brand-blue)]',
                    )}
                    style={{ width: `${utilization}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {previewOrders.length === 0 && mode === 'browse' && (
          <div className="mt-3 rounded-md border border-dashed border-border/80 bg-card/50 px-3 py-3 text-center">
            <p className="text-2xs text-muted-foreground">Select pending orders or check rows to preview a merge bundle.</p>
          </div>
        )}
      </div>

      <div className="px-4 py-3 space-y-2 border-t border-border/60 bg-card/50">
        <h4 className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Price details</h4>
        {lines.map(line => (
          <div key={line.label} className="flex justify-between items-center gap-3 min-h-6">
            <span className="text-2sm text-muted-foreground">{line.label}</span>
            <span className="text-2sm font-medium tabular-nums text-right">{formatLineAmount(line)}</span>
          </div>
        ))}
      </div>

      <div className="flex justify-between items-center px-4 py-3 border-t border-border bg-card">
        <span className="text-2sm text-muted-foreground">Total</span>
        <span className="text-base font-bold tabular-nums text-[var(--pulse-hero-blue)]">{formatCurrency(total)}</span>
      </div>

      {footer && (
        <div className="px-4 pb-4 pt-1 bg-card border-t border-border/60 shrink-0">{footer}</div>
      )}
    </div>
  );
}
