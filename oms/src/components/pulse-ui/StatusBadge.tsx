import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const statusBadgeVariants = cva(
  'inline-flex items-center rounded-md px-2 py-0.5 text-2sm font-medium capitalize whitespace-nowrap',
  {
    variants: {
      tone: {
        draft:     'bg-muted text-muted-foreground',
        ready:     'bg-[var(--pulse-brand-soft)] text-[var(--pulse-hero-blue)]',
        published: 'bg-[var(--pulse-brand-fill)] text-[var(--pulse-hero-blue)]',
        fulfilled: 'bg-[var(--pulse-success-bg)] text-[var(--pulse-success-text)]',
        cancelled: 'bg-[var(--pulse-danger-bg)] text-[var(--pulse-danger-text)]',
        pending:   'bg-[var(--pulse-warning-bg)] text-[var(--pulse-warning-text)]',
        warning:   'bg-[var(--pulse-warning-bg)] text-[var(--pulse-warning-text)]',
        info:      'bg-[var(--pulse-brand-soft)] text-[var(--pulse-hero-blue)]',
        success:   'bg-[var(--pulse-success-bg)] text-[var(--pulse-success-text)]',
      },
    },
    defaultVariants: { tone: 'info' },
  },
);

const STATUS_MAP: Record<string, VariantProps<typeof statusBadgeVariants>['tone']> = {
  draft: 'draft', ready: 'ready', published: 'published', fulfilled: 'fulfilled',
  cancelled: 'cancelled', optimizing: 'info',
  gateway_command: 'published', commerce_updated: 'fulfilled', plan_created: 'ready',
  indent_created: 'info', driver_assigned: 'info', trip_started: 'info',
  trip_completed: 'success', settlement: 'success', invoice: 'success',
  healthy: 'fulfilled', degraded: 'pending', down: 'cancelled',
  'Pending Consolidation': 'pending', Planned: 'ready', Fulfilled: 'fulfilled',
  Draft: 'draft', Cancelled: 'cancelled',
};

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const tone = STATUS_MAP[status] ?? 'info';
  return (
    <span className={cn(statusBadgeVariants({ tone }), className)}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}
