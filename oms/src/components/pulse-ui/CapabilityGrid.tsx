import { Link } from 'react-router-dom';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PlatformCapability } from '@/types/capabilities';
import { LottieIcon } from './LottieIcon';
import type { LottieAssetKey } from '@/lib/pulse-assets';

const CAPABILITY_LOTTIE: Partial<Record<string, LottieAssetKey>> = {
  catalog:   'planning',
  inventory: 'warehouse',
  crm:       'planning',
  orders:    'delivery',
  planning:  'logistics',
};

interface CapabilityGridProps {
  capabilities: PlatformCapability[];
  className?:   string;
}

export function CapabilityGrid({ capabilities, className }: CapabilityGridProps) {
  return (
    <div className={cn('grid gap-2 sm:grid-cols-2 lg:grid-cols-3', className)}>
      {capabilities.map(cap => {
        const inner = (
          <div className={cn(
            'pulse-card p-3 flex items-start gap-2.5 h-full min-h-[4.5rem]',
            cap.enabled ? 'hover:border-primary/25 hover:shadow-sm transition-all' : 'opacity-50',
          )}>
            <LottieIcon name={CAPABILITY_LOTTIE[cap.id] ?? 'planning'} size={32} className="shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 min-h-5">
                <p className="font-semibold text-2sm leading-tight">{cap.label}</p>
                {cap.enabled && <Check className="size-3 text-[var(--pulse-success-text)] shrink-0" />}
              </div>
              <p className="text-2xs text-muted-foreground mt-0.5 leading-snug">{cap.description}</p>
            </div>
          </div>
        );
        return cap.enabled && cap.route
          ? <Link key={cap.id} to={cap.route} className="block">{inner}</Link>
          : <div key={cap.id}>{inner}</div>;
      })}
    </div>
  );
}
