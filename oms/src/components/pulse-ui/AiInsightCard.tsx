import type { ReactNode } from 'react';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { LottieIcon } from './LottieIcon';
import type { LottieAssetKey } from '@/lib/pulse-assets';

interface AiInsightCardProps {
  title:       string;
  description: string;
  agent?:      string;
  metrics?:    { label: string; value: string }[];
  actionLabel?: string;
  onAction?:   () => void;
  lottie?:     LottieAssetKey;
  className?:  string;
  children?:   ReactNode;
}

export function AiInsightCard({
  title, description, agent = 'Planning Agent', metrics, actionLabel, onAction,
  lottie = 'merge', className, children,
}: AiInsightCardProps) {
  return (
    <div className={cn(
      'rounded-lg border border-primary/20 bg-gradient-to-br from-[var(--pulse-brand-soft)]/80 via-card to-card p-4',
      'transition-shadow hover:shadow-md',
      className,
    )}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex gap-3 min-w-0">
          <LottieIcon name={lottie} size={48} className="shrink-0" />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 mb-0.5">
              <Sparkles className="size-3.5 text-primary shrink-0" />
              <span className="text-3xs font-medium uppercase tracking-wide text-primary">{agent}</span>
            </div>
            <p className="font-semibold text-sm">{title}</p>
            <p className="text-2xs text-muted-foreground mt-0.5">{description}</p>
            {metrics && metrics.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
                {metrics.map(m => (
                  <div key={m.label} className="rounded-md bg-background/70 border border-border/60 px-2 py-1.5 text-center">
                    <p className="text-3xs text-muted-foreground">{m.label}</p>
                    <p className="text-2sm font-semibold mt-0.5">{m.value}</p>
                  </div>
                ))}
              </div>
            )}
            {children}
          </div>
        </div>
        {actionLabel && onAction && (
          <Button onClick={onAction} className="shrink-0">{actionLabel}</Button>
        )}
      </div>
    </div>
  );
}
