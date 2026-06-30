import { cn } from '@/lib/utils';

export type StatusDotTone = 'success' | 'warning' | 'danger' | 'info' | 'muted';

const TONE_STYLES: Record<StatusDotTone, { wrap: string; dot: string }> = {
  success: {
    wrap: 'bg-[var(--pulse-success-bg)] text-[var(--pulse-success-text)]',
    dot:  'bg-[var(--pulse-success-dot)]',
  },
  warning: {
    wrap: 'bg-[var(--pulse-warning-bg)] text-[var(--pulse-warning-text)]',
    dot:  'bg-[var(--pulse-warning-text)]',
  },
  danger: {
    wrap: 'bg-[var(--pulse-danger-bg)] text-[var(--pulse-danger-text)]',
    dot:  'bg-[var(--pulse-danger-text)]',
  },
  info: {
    wrap: 'bg-[var(--pulse-brand-soft)] text-[var(--pulse-hero-blue)]',
    dot:  'bg-[var(--pulse-brand-blue)]',
  },
  muted: {
    wrap: 'bg-muted text-muted-foreground',
    dot:  'bg-muted-foreground/50',
  },
};

interface StatusDotBadgeProps {
  label:     string;
  tone?:     StatusDotTone;
  className?: string;
}

export function StatusDotBadge({ label, tone = 'muted', className }: StatusDotBadgeProps) {
  const s = TONE_STYLES[tone];
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-2xs font-medium whitespace-nowrap', s.wrap, className)}>
      <span className={cn('size-1.5 rounded-full shrink-0', s.dot)} />
      {label}
    </span>
  );
}
