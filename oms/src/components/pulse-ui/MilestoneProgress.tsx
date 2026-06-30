import { Link } from 'react-router-dom';
import { CheckCircle2, Circle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MilestoneStep {
  id:    string;
  label: string;
  done:  boolean;
  href?: string;
}

interface MilestoneProgressProps {
  title:       string;
  description: string;
  steps:       MilestoneStep[];
  className?:  string;
}

export function MilestoneProgress({ title, description, steps, className }: MilestoneProgressProps) {
  const done = steps.filter(s => s.done).length;
  const pct = Math.round((done / steps.length) * 100);

  return (
    <div className={cn('pulse-card p-4', className)}>
      <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-sm leading-snug">{title}</h3>
          <p className="text-2xs text-muted-foreground mt-0.5">{description}</p>
        </div>
        <div className="text-right shrink-0 tabular-nums">
          <p className="text-base font-bold text-[var(--pulse-hero-blue)]">{pct}%</p>
          <p className="text-3xs text-muted-foreground">{done}/{steps.length} steps</p>
        </div>
      </div>
      <div className="h-1 rounded-full bg-muted overflow-hidden mb-3">
        <div className="h-full bg-[var(--pulse-hero-blue)] transition-all duration-500" style={{ width: `${pct}%` }} />
      </div>
      <ul className="space-y-1.5">
        {steps.map(step => {
          const inner = (
            <div className="flex items-center gap-2 text-2sm min-h-6">
              {step.done
                ? <CheckCircle2 className="size-3.5 text-[var(--pulse-success-text)] shrink-0" />
                : <Circle className="size-3.5 text-muted-foreground/40 shrink-0" />}
              <span className={step.done ? 'text-foreground' : 'text-muted-foreground'}>{step.label}</span>
            </div>
          );
          return (
            <li key={step.id}>
              {step.href && !step.done
                ? <Link to={step.href} className="hover:text-primary transition-colors">{inner}</Link>
                : inner}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
