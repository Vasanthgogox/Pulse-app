import { cn } from '@/lib/utils';
import type { ConsigneeEntityType } from '@/types/commerce';

interface ConsigneeEntityToggleProps {
  value:    ConsigneeEntityType;
  onChange: (v: ConsigneeEntityType) => void;
  className?: string;
}

export function ConsigneeEntityToggle({ value, onChange, className }: ConsigneeEntityToggleProps) {
  return (
    <div className={cn('space-y-1', className)}>
      <span className="text-2sm font-medium">Consignee type</span>
      <div className="grid grid-cols-2 gap-2 rounded-md border border-border p-0.5 bg-muted/30">
        {(['individual', 'business'] as const).map(type => (
          <button
            key={type}
            type="button"
            onClick={() => onChange(type)}
            className={cn(
              'rounded px-2 py-1.5 text-2xs font-medium capitalize transition-colors',
              value === type
                ? 'bg-card text-[var(--pulse-hero-blue)] shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {type}
          </button>
        ))}
      </div>
    </div>
  );
}
