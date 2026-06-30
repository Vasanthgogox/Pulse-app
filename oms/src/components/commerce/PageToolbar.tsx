import { cn } from '@/lib/utils';
import { Calendar } from 'lucide-react';
import type { ReactNode } from 'react';

interface PageToolbarProps {
  title:        string;
  breadcrumb?:  string[];
  description?: string;
  actions?:     ReactNode;
  showDate?:    boolean;
}

export function PageToolbar({ title, breadcrumb, description, actions, showDate = true }: PageToolbarProps) {
  return (
    <div className="flex flex-wrap items-start lg:items-center justify-between gap-3 pb-4 border-b border-border/50 mb-4">
      <div className="flex flex-col justify-center gap-1 min-w-0 flex-1">
        {breadcrumb && breadcrumb.length > 0 && (
          <div className="flex items-center gap-1 text-2xs text-muted-foreground">
            {breadcrumb.map((part, i) => (
              <span key={part} className="flex items-center gap-1">
                {i > 0 && <span className="text-muted-foreground/50">/</span>}
                <span className={cn(i === breadcrumb.length - 1 ? 'text-foreground font-medium' : '')}>{part}</span>
              </span>
            ))}
          </div>
        )}
        <h1 className="text-base font-bold leading-tight text-[var(--pulse-hero-blue)]">{title}</h1>
        {description && <p className="text-2sm text-muted-foreground max-w-2xl">{description}</p>}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {showDate && (
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-2sm text-muted-foreground hover:bg-accent transition-colors"
          >
            <Calendar className="size-3.5" />
            Jan 20, 2026 – Feb 09, 2026
          </button>
        )}
        {actions}
      </div>
    </div>
  );
}
