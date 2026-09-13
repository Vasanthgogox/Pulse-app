import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Truck, Weight, ArrowUp, ArrowDown, GitMerge,
  Loader2, Thermometer, Shield,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageToolbar } from '@/components/commerce/PageToolbar';
import { AiInsightCard, CommandBar, RouteTimeline } from '@/components/pulse-ui';
import { useCommerce } from '@/context/CommerceProvider';
import { buildPublishExecutionPlanPayload } from '@/lib/execution-api';
import { gatewayPath } from '@/lib/platform-gateway';
import {
  buildDefaultConstraints, buildPlanGraph, computeOptimizationMetrics,
  getStopById, reorderRoute,
} from '@/lib/merge-engine';
import { formatCurrency } from '@/lib/utils';
import type { ExecutionPlan } from '@/types/commerce';

export function ExecutionPlanBuilderPage() {
  const navigate = useNavigate();
  const {
    orders, selectedOrderIds, toggleOrderSelection, clearOrderSelection,
    mergeRecommendations, applyMergeRecommendation,
    createExecutionPlan, publishExecutionPlan,
    tenant, identity,
  } = useCommerce();

  const [search, setSearch] = useState('');
  const [stops, setStops] = useState<ReturnType<typeof buildPlanGraph>['stops']>([]);
  const [allocations, setAllocations] = useState<ReturnType<typeof buildPlanGraph>['allocations']>([]);
  const [route, setRoute] = useState<ReturnType<typeof buildPlanGraph>['route']>({ sequence: [] });
  const [publishing, setPublishing] = useState(false);
  const [showPayload, setShowPayload] = useState(false);

  const pending = orders.filter(o => o.status === 'Pending Consolidation');
  const filtered = pending.filter(o => {
    const q = search.toLowerCase();
    return !q || o.order_number.toLowerCase().includes(q) || o.customer_name.toLowerCase().includes(q);
  });
  const selected = orders.filter(o => selectedOrderIds.includes(o.id));
  const metrics = useMemo(() => computeOptimizationMetrics(selected), [selected]);
  const constraints = useMemo(() => buildDefaultConstraints(selected), [selected]);

  useEffect(() => {
    if (selected.length === 0) {
      setStops([]); setAllocations([]); setRoute({ sequence: [] });
      return;
    }
    const graph = buildPlanGraph(selected);
    setStops(graph.stops);
    setAllocations(graph.allocations);
    setRoute(graph.route);
  }, [selectedOrderIds, selected.length]);

  const orderedStops = route.sequence
    .map(id => getStopById(stops, id))
    .filter((s): s is NonNullable<typeof s> => Boolean(s));

  const previewPayload = useMemo(() => {
    if (selected.length === 0 || stops.length === 0) return null;
    const draft: ExecutionPlan = {
      id: 'draft', plan_number: 'DRAFT', status: 'ready', origin: 'customer_orders',
      stops, route, allocations, constraints, order_ids: selectedOrderIds,
      total_orders: selected.length,
      total_amount: selected.reduce((s, o) => s + o.total_amount, 0),
      total_weight_kg: selected.reduce((s, o) => s + o.total_weight_kg, 0),
      total_volume_m3: selected.reduce((s, o) => s + o.total_volume_m3, 0),
      optimization: metrics, created_by: 'Admin',
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    };
    return buildPublishExecutionPlanPayload(draft, selected, tenant, identity.user.name, '', '');
  }, [selected, selectedOrderIds, stops, route, allocations, constraints, metrics, tenant, identity.user.name]);

  async function handlePublish() {
    if (!selectedOrderIds.length) return;
    setPublishing(true);
    const plan = createExecutionPlan(selectedOrderIds, stops, route, allocations, constraints, metrics);
    await publishExecutionPlan(plan.id, plan);
    setPublishing(false);
    navigate('/execution');
  }

  const topRec = mergeRecommendations[0];

  return (
    <div className="container-fluid">
      <PageToolbar
        title="Execution Plan Builder"
        breadcrumb={['Commerce', 'Orders', 'Plan Builder']}
        description="Optimize utilization and cost — then publish an execution plan. Execution creates the dispatch job."
      />

      {topRec && (
        <AiInsightCard
          className="mb-3"
          agent="Planning Agent"
          lottie="merge"
          title={topRec.title}
          description="Optimize utilization and cost before publishing through Pulse Gateway."
          metrics={[
            { label: 'Savings', value: formatCurrency(topRec.savings_inr) },
            { label: 'Utilization', value: `${topRec.vehicle_utilization_pct}%` },
            { label: 'Distance', value: `${topRec.distance_saved_km} km` },
            { label: 'Carbon', value: `${topRec.carbon_saved_kg} kg` },
          ]}
          actionLabel="Merge Automatically"
          onAction={() => applyMergeRecommendation(topRec.id)}
        />
      )}

      <div className="grid gap-3 xl:grid-cols-12 items-start">
        <div className="xl:col-span-4 flex flex-col gap-3 min-w-0">
          <CardShell title="Pending Orders">
            <div className="px-3 py-2 border-b border-border">
              <CommandBar
                placeholder="Search orders…"
                value={search}
                onChange={setSearch}
                className="border-0 shadow-none px-0 py-0"
              />
            </div>
            <div className="max-h-[320px] overflow-y-auto divide-y divide-border">
              {filtered.map(o => (
                <label
                  key={o.id}
                  className={`flex gap-2.5 px-3 py-2 cursor-pointer hover:bg-muted/40 ${selectedOrderIds.includes(o.id) ? 'bg-[var(--pulse-brand-soft)] border-s-2 border-s-primary' : ''}`}
                >
                  <input type="checkbox" checked={selectedOrderIds.includes(o.id)} onChange={() => toggleOrderSelection(o.id)} className="mt-0.5 size-3.5 accent-primary" />
                  <div className="min-w-0">
                    <p className="text-2sm font-medium truncate">{o.order_number}</p>
                    <p className="text-2xs text-muted-foreground truncate">{o.customer_name} · {o.total_weight_kg} kg</p>
                  </div>
                </label>
              ))}
            </div>
          </CardShell>
        </div>

        <div className="xl:col-span-5 flex flex-col gap-3 min-w-0">
          <CardShell title="Stops (definitions)">
            <div className="p-3">
              <RouteTimeline stops={stops} />
            </div>
          </CardShell>

          <CardShell title="Route (optimized sequence)">
            <div className="p-3">
              <RouteTimeline stops={stops} sequence={route.sequence} />
            </div>
            {orderedStops.length > 0 && (
              <div className="border-t border-border divide-y divide-border">
                {orderedStops.map((s, idx) => (
                  <div key={s.stop_id} className="flex items-center gap-2 px-3 py-1.5">
                    <div className="flex-1 text-2sm font-medium truncate">{s.label}</div>
                    <div className="flex flex-col">
                      <button type="button" onClick={() => setRoute(reorderRoute(route, idx, -1))} className="p-0.5 hover:bg-muted rounded"><ArrowUp className="size-3" /></button>
                      <button type="button" onClick={() => setRoute(reorderRoute(route, idx, 1))} className="p-0.5 hover:bg-muted rounded"><ArrowDown className="size-3" /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardShell>

          <CardShell title="Shipment allocations">
            <div className="p-3 space-y-1.5">
              {allocations.map(a => {
                const o = orders.find(x => x.id === a.order_id);
                const pu = getStopById(stops, a.pickup_stop_id);
                const dr = getStopById(stops, a.drop_stop_id);
                return (
                  <div key={a.allocation_id} className="rounded-md border px-2.5 py-1.5 text-2xs">
                    <span className="font-medium">{o?.order_number}</span>
                    <span className="text-muted-foreground"> · {pu?.label} → {dr?.label}</span>
                  </div>
                );
              })}
            </div>
          </CardShell>
        </div>

        <div className="xl:col-span-3 flex flex-col gap-3 min-w-0 xl:sticky xl:top-[calc(var(--header-total-height)+0.75rem)]">
          <CardShell title="Selected">
            <div className="p-3 space-y-2">
              <p className="text-2xl font-bold tabular-nums">{selectedOrderIds.length}</p>
              <Row icon={Weight} label="Weight" value={`${selected.reduce((s,o)=>s+o.total_weight_kg,0).toFixed(1)} kg`} />
              <Row icon={Truck} label="Vehicle" value={constraints.vehicle_type ?? '—'} />
              <Row label="Merge score" value={String(metrics.merge_score)} />
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div className="h-full bg-primary transition-all" style={{ width: `${metrics.vehicle_utilization_pct}%` }} />
              </div>
              {selectedOrderIds.length > 0 && (
                <button type="button" onClick={clearOrderSelection} className="text-2xs text-muted-foreground hover:text-destructive">Clear</button>
              )}
            </div>
          </CardShell>

          <CardShell title="Execution constraints">
            <div className="p-3 grid grid-cols-2 gap-1.5">
              <Constraint label="Vehicle" value={constraints.vehicle_type ?? '—'} icon={Truck} />
              <Constraint label="Temp" value={constraints.temperature} icon={Thermometer} />
              <Constraint label="Max weight" value={`${constraints.max_weight_kg} kg`} icon={Weight} />
              <Constraint label="Max volume" value={`${constraints.max_volume_m3} m³`} />
              <Constraint label="SLA" value={`${constraints.delivery_sla_hours}h`} />
              <Constraint label="Fragile" value={constraints.fragile ? 'Yes' : 'No'} icon={Shield} />
            </div>
          </CardShell>

          <Button className="w-full" size="md" disabled={!selectedOrderIds.length || publishing} onClick={handlePublish}>
            {publishing ? <Loader2 className="size-3.5 animate-spin" /> : <GitMerge className="size-3.5" />}
            Publish Execution Plan
          </Button>

          {previewPayload && (
            <CardShell title="Gateway command">
              <button type="button" onClick={() => setShowPayload(v => !v)} className="w-full text-left px-3 py-1.5 text-3xs text-muted-foreground font-mono">
                POST {gatewayPath('execution', '/execution-plans')} {showPayload ? '▲' : '▼'}
              </button>
              {showPayload && <pre className="px-2.5 pb-2.5 text-3xs overflow-x-auto max-h-40 font-mono">{JSON.stringify(previewPayload, null, 2)}</pre>}
            </CardShell>
          )}
        </div>
      </div>
    </div>
  );
}

function CardShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden shadow-none">
      <div className="border-b border-border px-3 py-2 bg-muted/20">
        <p className="text-3xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      </div>
      {children}
    </div>
  );
}

function Row({ icon: Icon, label, value }: { icon?: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <div className="flex justify-between text-2sm gap-2">
      <span className="text-muted-foreground flex items-center gap-1 shrink-0">{Icon && <Icon className="size-3" />}{label}</span>
      <span className="font-medium text-right truncate">{value}</span>
    </div>
  );
}

function Constraint({ label, value, icon: Icon }: { label: string; value: string; icon?: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="rounded-md bg-muted/40 px-2 py-1">
      <p className="text-3xs text-muted-foreground flex items-center gap-1">{Icon && <Icon className="size-2.5" />}{label}</p>
      <p className="text-2xs font-medium capitalize truncate">{value}</p>
    </div>
  );
}
