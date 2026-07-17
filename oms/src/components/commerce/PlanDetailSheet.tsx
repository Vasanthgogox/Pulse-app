import { Link } from 'react-router-dom';
import { Radio } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EntityFlexSheet } from '@/components/commerce/EntityFlexSheet';
import { CorrelationTrace, RouteTimeline, StatusBadge } from '@/components/pulse-ui';
import { useCommerce } from '@/context/CommerceProvider';
import { formatCurrency, formatDateTime } from '@/lib/utils';
import { getStopById } from '@/lib/merge-engine';

interface PlanDetailSheetProps {
  planId: string | null;
  open:   boolean;
  onClose: () => void;
}

export function PlanDetailSheet({ planId, open, onClose }: PlanDetailSheetProps) {
  const { plans, orders } = useCommerce();
  const plan = plans.find(p => p.id === planId) ?? null;

  if (!plan) return null;

  const planOrders = orders.filter(o => plan.order_ids.includes(o.id));

  return (
    <EntityFlexSheet
      open={open}
      entity={plan}
      title="Execution Plan"
      editing={false}
      canEdit={false}
      canDelete={false}
      onClose={onClose}
      onEdit={() => {}}
      onCancelEdit={() => {}}
      onSave={() => {}}
      onDelete={() => {}}
      footer={
        <div className="flex flex-col gap-2">
          {plan.status === 'ready' && (
            <Button className="w-full" size="sm" asChild>
              <Link to="/execution-plans/build">Open in Plan Builder →</Link>
            </Button>
          )}
          {plan.correlation_id && (
            <Button className="w-full" variant="outline" size="sm" asChild>
              <Link to="/observatory">View in Observatory →</Link>
            </Button>
          )}
        </div>
      }
    >
      <div className="space-y-4">
        <div className="pulse-card p-4 bg-[var(--pulse-brand-soft)]/30">
          <p className="font-mono font-bold text-base text-[var(--pulse-hero-blue)]">{plan.plan_number}</p>
          <div className="flex flex-wrap gap-2 mt-2">
            <StatusBadge status={plan.status} />
            {plan.journey_in_progress && <StatusBadge status="trip_started" />}
            {plan.lifecycle_stage && <StatusBadge status={plan.lifecycle_stage} />}
          </div>
          <dl className="grid grid-cols-2 gap-3 mt-4 text-2sm">
            <div>
              <dt className="text-3xs text-muted-foreground uppercase">Orders</dt>
              <dd className="font-semibold tabular-nums">{plan.total_orders}</dd>
            </div>
            <div>
              <dt className="text-3xs text-muted-foreground uppercase">Amount</dt>
              <dd className="font-semibold tabular-nums">{formatCurrency(plan.total_amount)}</dd>
            </div>
            <div>
              <dt className="text-3xs text-muted-foreground uppercase">Weight</dt>
              <dd className="font-medium tabular-nums">{plan.total_weight_kg.toFixed(1)} kg</dd>
            </div>
            <div>
              <dt className="text-3xs text-muted-foreground uppercase">Vehicle</dt>
              <dd className="font-medium">{plan.constraints.vehicle_type}</dd>
            </div>
          </dl>
          {plan.optimization && (
            <p className="text-2xs text-muted-foreground mt-3">
              Merge score <span className="font-semibold text-[var(--pulse-hero-blue)]">{plan.optimization.merge_score}</span>
              {' · '}{plan.optimization.distance_saved_km} km saved
            </p>
          )}
          {plan.published_at && (
            <p className="text-2xs text-muted-foreground mt-1">Published {formatDateTime(plan.published_at)}</p>
          )}
        </div>

        {plan.correlation_id && (
          <div className="rounded-lg border border-border px-3 py-2 flex items-center gap-2 min-w-0">
            <Radio className="size-3.5 text-[var(--pulse-hero-blue)] shrink-0" />
            <code className="text-3xs font-mono truncate text-[var(--pulse-hero-blue)]">{plan.correlation_id}</code>
          </div>
        )}

        <div>
          <h3 className="commerce-section-title mb-2">Route sequence</h3>
          <RouteTimeline stops={plan.stops} sequence={plan.route.sequence} />
        </div>

        <div>
          <h3 className="commerce-section-title mb-2">Shipment allocations</h3>
          <div className="space-y-2">
            {plan.allocations.map(a => {
              const o = planOrders.find(x => x.id === a.order_id);
              const pu = getStopById(plan.stops, a.pickup_stop_id);
              const dr = getStopById(plan.stops, a.drop_stop_id);
              return (
                <div key={a.allocation_id} className="pulse-card px-3 py-2 text-2sm">
                  <span className="font-medium">{o?.order_number ?? a.order_id}</span>
                  <span className="text-muted-foreground"> · {pu?.label} → {dr?.label}</span>
                </div>
              );
            })}
          </div>
        </div>

        {plan.correlation_id && (
          <div className="border-t border-border pt-4">
            <h3 className="commerce-section-title mb-2">Lifecycle trace</h3>
            <CorrelationTrace correlationId={plan.correlation_id} compact />
          </div>
        )}
      </div>
    </EntityFlexSheet>
  );
}
