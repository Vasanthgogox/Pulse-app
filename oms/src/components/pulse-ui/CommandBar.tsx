import type { ReactNode } from 'react';
import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CommandBarProps {
  placeholder?: string;
  value?:         string;
  onChange?:      (v: string) => void;
  actions?:       ReactNode;
  className?:     string;
}

export function CommandBar({ placeholder = 'Search…', value, onChange, actions, className }: CommandBarProps) {
  return (
    <div className={cn(
      'flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-none',
      className,
    )}>
      <div className="flex flex-1 min-w-[200px] items-center gap-2">
        <Search className="size-4 text-muted-foreground shrink-0" />
        <input
          type="search"
          value={value}
          onChange={e => onChange?.(e.target.value)}
          placeholder={placeholder}
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
