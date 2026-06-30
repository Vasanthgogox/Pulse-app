import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { StatusBadge } from './StatusBadge';

interface EntityCardProps {
  title:       string;
  subtitle?:   string;
  status?:     string;
  icon?:       ReactNode;
  meta?:       { label: string; value: string }[];
  actions?:    ReactNode;
  onClick?:    () => void;
  className?:  string;
  highlight?:  boolean;
}

export function EntityCard({
  title, subtitle, status, icon, meta, actions, onClick, className, highlight,
}: EntityCardProps) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'w-full text-left rounded-xl border border-border bg-card p-4 shadow-none transition-all',
        'hover:border-[var(--pulse-hero-blue)]/20 hover:bg-[var(--pulse-brand-soft)]/20',
        highlight && 'border-[var(--pulse-hero-blue)]/25 bg-[var(--pulse-brand-soft)]/40',
        onClick && 'cursor-pointer',
        className,
      )}
    >
      <div className="flex items-center gap-3">
        {icon && <div className="shrink-0">{icon}</div>}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="font-semibold text-2sm truncate leading-tight">{title}</p>
              {subtitle && <p className="text-2xs text-muted-foreground truncate mt-0.5">{subtitle}</p>}
            </div>
            {status && <StatusBadge status={status} className="shrink-0" />}
          </div>
          {meta && meta.length > 0 && (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 mt-3">
              {meta.map(row => (
                <div key={row.label}>
                  <dt className="text-2xs text-muted-foreground">{row.label}</dt>
                  <dd className="text-2sm font-medium">{row.value}</dd>
                </div>
              ))}
            </dl>
          )}
          {actions && <div className="mt-3 flex flex-wrap gap-2">{actions}</div>}
        </div>
      </div>
    </Tag>
  );
}
