import { MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PlanStop } from '@/types/commerce';
import { formatStopAddress, isAddressIncomplete } from '@/lib/address';
import { LottieIcon } from './LottieIcon';

interface RouteTimelineProps {
  stops:     PlanStop[];
  sequence?: string[];
  className?: string;
  onMissingAddress?: (stop: PlanStop) => void;
  emptyHint?: string;
}

export function RouteTimeline({ stops, sequence, className, onMissingAddress, emptyHint }: RouteTimelineProps) {
  const ordered = sequence
    ? sequence.map(id => stops.find(s => s.stop_id === id)).filter((s): s is PlanStop => Boolean(s))
    : stops;

  if (ordered.length === 0) {
    return (
      <div className={cn('rounded-xl border border-dashed border-border p-6 text-center text-2sm text-muted-foreground', className)}>
        <LottieIcon name="map" size={72} className="mx-auto mb-3 opacity-70" />
        {emptyHint ?? 'Select orders to build a route'}
      </div>
    );
  }

  return (
    <div className={cn('space-y-0', className)}>
      {ordered.map((stop, i) => (
        <div key={stop.stop_id} className="flex gap-3">
          <div className="flex flex-col items-center">
            <div className={cn(
              'size-7 rounded-full flex items-center justify-center text-3xs font-bold border-2',
              stop.type === 'pickup'
                ? 'border-[var(--pulse-brand-blue)] bg-[var(--pulse-brand-soft)] text-[var(--pulse-hero-blue)] dark:border-sky-700 dark:bg-sky-950 dark:text-sky-300'
                : 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
            )}>
              {i + 1}
            </div>
            {i < ordered.length - 1 && <div className="w-0.5 flex-1 min-h-6 bg-border my-1" />}
          </div>
          <div className="flex-1 pb-4 min-w-0">
            <div className="flex items-center gap-2">
              <MapPin className="size-3.5 text-muted-foreground shrink-0" />
              <p className="font-medium text-2sm truncate">{stop.label}</p>
              <span className="text-2xs capitalize text-muted-foreground ml-auto">{stop.type}</span>
            </div>
            <p className="text-2sm text-muted-foreground mt-0.5 truncate">
              {isAddressIncomplete(stop.address) ? (
                <button
                  type="button"
                  className="text-[var(--pulse-hero-blue)] font-medium hover:underline"
                  onClick={() => onMissingAddress?.(stop)}
                >
                  Add {stop.type === 'drop' ? 'client' : 'pickup'} address
                </button>
              ) : (
                formatStopAddress(stop.address)
              )}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
