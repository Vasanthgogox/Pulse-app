import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import type { ExecutionPlan } from '@/types/commerce';
import { formatCurrency } from '@/lib/utils';
import { EntityCard } from './EntityCard';
import { LottieIcon } from './LottieIcon';

interface ExecutionCardProps {
  plan:     ExecutionPlan;
  href?:    string;
  onClick?: () => void;
}

export function ExecutionCard({ plan, href, onClick }: ExecutionCardProps) {
  const card = (
    <EntityCard
      title={plan.plan_number}
      subtitle={`${plan.total_orders} orders · ${plan.constraints.vehicle_type ?? '—'}`}
      status={plan.status}
      icon={<LottieIcon name="logistics" size={48} />}
      meta={[
        { label: 'Weight', value: `${plan.total_weight_kg} kg` },
        { label: 'Amount', value: formatCurrency(plan.total_amount) },
        ...(plan.optimization
          ? [{ label: 'Utilization', value: `${plan.optimization.vehicle_utilization_pct}%` }]
          : []),
      ]}
      onClick={onClick}
      highlight={plan.status === 'ready'}
    />
  );

  if (href) return <Link to={href} className="block">{card}</Link>;
  return card;
}

export function ExecutionCardRow({ plan }: { plan: ExecutionPlan }) {
  return (
    <div className="flex items-center justify-between px-5 py-3 gap-3 hover:bg-accent/30 transition-colors">
      <div className="flex items-center gap-3 min-w-0">
        <LottieIcon name="delivery" size={40} />
        <div className="min-w-0">
          <p className="font-mono text-sm font-medium truncate">{plan.plan_number}</p>
          <p className="text-2sm text-muted-foreground truncate">
            {plan.total_orders} orders · {plan.constraints.vehicle_type}
          </p>
        </div>
      </div>
      <ArrowRight className="size-4 text-muted-foreground shrink-0" />
    </div>
  );
}
