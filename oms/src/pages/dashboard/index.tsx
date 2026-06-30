import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { PageToolbar } from '@/components/commerce/PageToolbar';
import {
  AiInsightCard, CapabilityGrid, EntityCard, KpiCard, LottieIcon, MilestoneProgress, StatusBadge,
} from '@/components/pulse-ui';
import { useCommerce } from '@/context/CommerceProvider';
import { COMMERCE_CAPABILITIES } from '@/types/capabilities';
import { formatCurrency } from '@/lib/utils';

export function DashboardPage() {
  const navigate = useNavigate();
  const { stats, orders, plans, mergeRecommendations, tenant, identity } = useCommerce();
  const pending = orders.filter(o => o.status === 'Pending Consolidation');
  const topRec = mergeRecommendations[0];
  const m1Fulfilled = plans.some(p => p.status === 'fulfilled' && p.correlation_id);
  const m2Rec = mergeRecommendations.find(r => r.id === 'rec-m2-multistop');
  const hasProducts = true;
  const hasCustomers = true;
  const hasPendingOrders = pending.length > 0;
  const hasPublishedPlan = plans.some(p => p.status === 'published' || p.status === 'fulfilled');

  return (
    <div className="container-fluid">
      <PageToolbar
        title="Commerce Dashboard"
        breadcrumb={['Pulse Platform', 'Commerce']}
        description={`${identity.company.name} · Milestone-first · prove Commerce → Execution → Settlement`}
      />

      <div className="rounded-lg border border-border bg-card px-3 py-1.5 mb-4 flex flex-wrap gap-x-4 gap-y-0.5 text-3xs text-muted-foreground font-mono">
        <span>tenant: {tenant.tenantId}</span>
        <span>org: {tenant.organizationId}</span>
        <span>bu: {tenant.businessUnitId}</span>
      </div>

      <div className="grid gap-3 pulse-stat-grid commerce-section">
        <KpiCard label="Pending orders" value={String(stats.pending_orders)} href="/orders" lottie="delivery" trend="+12%" />
        <KpiCard label="Published plans" value={String(stats.published_plans)} href="/execution-plans" lottie="logistics" />
        <KpiCard label="Revenue (MTD)" value={formatCurrency(stats.revenue_this_month)} lottie="finance" />
        <KpiCard label="Warehouses" value="3 active" href="/warehouses" lottie="warehouse" />
      </div>

      <div className="pulse-two-col commerce-section">
        <MilestoneProgress
          title="Milestone 1 — First Complete Execution"
          description="One order from merchant to settlement with full correlation trace."
          steps={[
            { id: 'm1-products', label: 'Products in catalog', done: hasProducts, href: '/products' },
            { id: 'm1-customers', label: 'Customer created', done: hasCustomers, href: '/customers' },
            { id: 'm1-orders', label: 'Orders pending consolidation', done: hasPendingOrders, href: '/orders' },
            { id: 'm1-plan', label: 'Execution plan built', done: plans.length > 1, href: '/execution-plans/build' },
            { id: 'm1-publish', label: 'Published via Gateway', done: hasPublishedPlan, href: '/execution-plans' },
            { id: 'm1-settlement', label: 'Dispatcher → Driver → Settlement', done: m1Fulfilled, href: '/execution' },
          ]}
        />
        <MilestoneProgress
          title="Milestone 2 — First Multi-Stop Execution"
          description="WH-A + WH-B → 3 retailers · 5 orders · 1 vehicle · sequential POD."
          steps={[
            { id: 'm2-orders', label: '5 M2 orders loaded (M2-2026-001…005)', done: orders.some(o => o.id.startsWith('ORD-M2')) },
            { id: 'm2-merge', label: 'M2 merge recommendation available', done: Boolean(m2Rec) },
            { id: 'm2-pickups', label: '2 warehouse pickup stops', done: false, href: '/execution-plans/build' },
            { id: 'm2-drops', label: '3 retailer drop stops', done: false },
            { id: 'm2-pod', label: 'Sequential POD per drop', done: false },
            { id: 'm2-complete', label: 'Automatic trip completion', done: false },
          ]}
        />
      </div>

      {topRec && (
        <AiInsightCard
          className="mb-4"
          agent="Planning Agent"
          lottie="merge"
          title={topRec.title}
          description="Pulse AI analyzed pending orders for merge potential and route efficiency."
          metrics={[
            { label: 'Savings', value: formatCurrency(topRec.savings_inr) },
            { label: 'Utilization', value: `${topRec.vehicle_utilization_pct}%` },
            { label: 'Distance', value: `${topRec.distance_saved_km} km` },
            { label: 'Carbon', value: `${topRec.carbon_saved_kg} kg` },
          ]}
          actionLabel="Open Plan Builder"
          onAction={() => navigate('/execution-plans/build')}
        />
      )}

      <section className="commerce-section">
        <div className="commerce-section-header">
          <h2 className="commerce-section-title">Commerce capabilities</h2>
          <span className="commerce-section-subtitle">License-ready modules</span>
        </div>
        <CapabilityGrid capabilities={COMMERCE_CAPABILITIES} />
      </section>

      <div className="pulse-two-col">
        <section className="pulse-card overflow-hidden">
          <div className="pulse-card-header">
            <div className="flex items-center gap-2 min-w-0">
              <LottieIcon name="delivery" size={28} className="shrink-0" />
              <h2 className="commerce-section-title">Recent orders</h2>
            </div>
            <Link to="/orders" className="text-2xs text-[var(--pulse-hero-blue)] font-medium flex items-center gap-1 shrink-0">View all <ArrowRight className="size-3" /></Link>
          </div>
          <div className="divide-y divide-border">
            {pending.slice(0, 5).map(o => (
              <EntityCard
                key={o.id}
                className="border-0 rounded-none shadow-none hover:shadow-none px-4 py-2.5 min-h-11"
                title={o.order_number}
                subtitle={o.customer_name}
                status={o.status}
              />
            ))}
          </div>
        </section>

        <section className="pulse-card overflow-hidden">
          <div className="pulse-card-header">
            <div className="flex items-center gap-2 min-w-0">
              <LottieIcon name="logistics" size={28} className="shrink-0" />
              <h2 className="commerce-section-title">Execution plans</h2>
            </div>
            <Link to="/execution-plans" className="text-2xs text-[var(--pulse-hero-blue)] font-medium flex items-center gap-1 shrink-0">View all <ArrowRight className="size-3" /></Link>
          </div>
          <div className="divide-y divide-border">
            {plans.slice(0, 5).map(p => (
              <div key={p.id} className="px-4 py-2.5 min-h-11 flex justify-between gap-3 items-center hover:bg-[var(--pulse-brand-soft)]/30 transition-colors">
                <div className="min-w-0">
                  <p className="font-mono text-2sm font-medium truncate">{p.plan_number}</p>
                  <p className="text-2xs text-muted-foreground truncate">{p.total_orders} orders · {p.constraints.vehicle_type}</p>
                </div>
                <StatusBadge status={p.status} />
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
