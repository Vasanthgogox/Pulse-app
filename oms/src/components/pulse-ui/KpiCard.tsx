import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { LottieIcon } from './LottieIcon';
import type { LottieAssetKey } from '@/lib/pulse-assets';

interface KpiCardProps {
  label:    string;
  value:    string;
  href?:    string;
  lottie?:  LottieAssetKey;
  trend?:   string;
  className?: string;
  footer?:  ReactNode;
}

export function KpiCard({ label, value, href, lottie = 'planning', trend, className, footer }: KpiCardProps) {
  const inner = (
    <div className={cn(
      'pulse-card p-3.5 hover:border-primary/25 hover:shadow-sm transition-all group',
      className,
    )}>
      <div className="flex items-start justify-between gap-2">
        <LottieIcon name={lottie} size={40} className="group-hover:scale-105 transition-transform shrink-0" />
        {trend && (
          <span className="text-3xs font-medium text-[var(--pulse-success-text)] bg-[var(--pulse-success-bg)] px-1.5 py-0.5 rounded-full shrink-0">
            {trend}
          </span>
        )}
      </div>
      <p className="text-2xs text-muted-foreground mt-2">{label}</p>
      <p className="text-base font-bold mt-0.5 tracking-tight tabular-nums">{value}</p>
      {footer}
    </div>
  );
  return href ? <Link to={href} className="block">{inner}</Link> : inner;
}
