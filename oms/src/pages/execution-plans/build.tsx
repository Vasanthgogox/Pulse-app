import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Truck, Weight, ArrowUp, ArrowDown, GitMerge,
  Loader2, Thermometer, Shield,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageToolbar } from '@/components/commerce/PageToolbar';
import { AiInsightCard, CommandBar, RouteTimeline } from '@/components/pulse-ui';
import { useCommerce } from '@/context/CommerceProvider';
import { useExecution } from '@/context/ExecutionProvider';
import { buildPublishExecutionPlanPayload } from '@/lib/execution-api';
import {
  findCommerceExecutionForPlan,
  planLifecycleKind,
  planLifecycleLabel,
} from '@/lib/commerce-execution-status';
import { gatewayPath } from '@/lib/platform-gateway';
import {
  buildDefaultConstraints, buildPlanGraph, computeOptimizationMetrics,
  getStopById, reorderRoute,
} from '@/lib/merge-engine';
import { formatCurrency } from '@/lib/utils';
import type { Address, ExecutionPlan, PlanStop } from '@/types/commerce';
import { isAddressIncomplete } from '@/lib/address';
import { StopAddressDialog } from '@/components/commerce/StopAddressDialog';
import { PublishPlanConfirmDialog } from '@/components/commerce/PublishPlanConfirmDialog';
import { useOrganization } from '@/context/OrganizationProvider';

export function ExecutionPlanBuilderPage() {
  const navigate = useNavigate();
  const {
    orders, selectedOrderIds, toggleOrderSelection, clearOrderSelection,
    mergeRecommendations, applyMergeRecommendation,
    createExecutionPlan, publishExecutionPlan,
    tenant, identity, updateOrder, plans,
  } = useCommerce();
  const { commerceExecutions } = useExecution();
  const org = useOrganization();

  const [search, setSearch] = useState('');
  const [stops, setStops] = useState<ReturnType<typeof buildPlanGraph>['stops']>([]);
  const [allocations, setAllocations] = useState<ReturnType<typeof buildPlanGraph>['allocations']>([]);
  const [route, setRoute] = useState<ReturnType<typeof buildPlanGraph>['route']>({ sequence: [] });
  const [publishing, setPublishing] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [showPayload, setShowPayload] = useState(false);
  const [addressStopId, setAddressStopId] = useState<string | null>(null);
  const [skippedStopIds, setSkippedStopIds] = useState<string[]>([]);
  const [previewPlanId, setPreviewPlanId] = useState<string | null>(null);

  const pending = orders.filter(o => o.status === 'Pending Consolidation');
  const savedPlans = useMemo(
    () => [...plans].sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || '')),
    [plans],
  );
  const previewPlan = previewPlanId
    ? savedPlans.find(p => p.id === previewPlanId) ?? null
    : null;
  const previewExec = previewPlan
    ? findCommerceExecutionForPlan(commerceExecutions, previewPlan)
    : undefined;
  const previewLifecycle = previewPlan
    ? planLifecycleLabel(planLifecycleKind(previewPlan.status, previewExec, previewPlan.indent_id))
    : null;

  function handleToggleOrder(id: string) {
    setPreviewPlanId(null);
    toggleOrderSelection(id);
  }

  function handlePreviewPlan(id: string) {
    clearOrderSelection();
    setPreviewPlanId(current => (current === id ? null : id));
  }
  const filtered = pending.filter(o => {
    const q = search.toLowerCase();
    return !q || o.order_number.toLowerCase().includes(q) || o.customer_name.toLowerCase().includes(q);
  });
  const selected = orders.filter(o => selectedOrderIds.includes(o.id));
  const metrics = useMemo(() => computeOptimizationMetrics(selected), [selected]);
  const constraints = useMemo(() => buildDefaultConstraints(selected), [selected]);
  const displayStops = previewPlan ? previewPlan.stops : stops;
  const displayRoute = previewPlan ? previewPlan.route : route;
  const displayAllocations = previewPlan ? previewPlan.allocations : allocations;
  const displayConstraints = previewPlan ? previewPlan.constraints : constraints;
  const displayMetrics = previewPlan?.optimization ?? metrics;
  const emptyRouteHint = previewPlan
    ? 'This plan has no stops to preview'
    : 'Select pending orders to build a route, or preview a saved plan';

  const addressFingerprint = selected
    .map(o => `${o.id}:${o.pickup_address.line1}:${o.pickup_address.city}:${o.drop_address.line1}:${o.drop_address.city}:${o.drop_address.pincode}`)
    .join('|');

  useEffect(() => {
    if (selected.length === 0) {
      setStops([]); setAllocations([]); setRoute({ sequence: [] });
      return;
    }
    const graph = buildPlanGraph(selected);
    setStops(graph.stops);
    setAllocations(graph.allocations);
    setRoute((prev) => {
      const ids = new Set(graph.route.sequence);
      const kept = prev.sequence.filter((id) => ids.has(id));
      return kept.length === graph.route.sequence.length ? { sequence: kept } : graph.route;
    });
  }, [selectedOrderIds, selected.length, addressFingerprint]);

  const orderedStops = displayRoute.sequence
    .map(id => getStopById(displayStops, id))
    .filter((s): s is NonNullable<typeof s> => Boolean(s));

  const addressStop = addressStopId
    ? stops.find(s => s.stop_id === addressStopId) ?? null
    : null;

  useEffect(() => {
    if (previewPlan || addressStopId) return;
    const missing = stops.find(
      s => isAddressIncomplete(s.address) && !skippedStopIds.includes(s.stop_id),
    );
    if (missing) setAddressStopId(missing.stop_id);
  }, [stops, addressStopId, skippedStopIds, previewPlan]);

  function orderForStop(stop: PlanStop) {
    const alloc = allocations.find(a =>
      stop.type === 'drop' ? a.drop_stop_id === stop.stop_id : a.pickup_stop_id === stop.stop_id,
    );
    return alloc ? orders.find(o => o.id === alloc.order_id) ?? null : null;
  }

  async function handleSaveStopAddress(address: Address) {
    if (!addressStop) return;
    const order = orderForStop(addressStop);
    if (addressStop.type === 'drop') {
      if (order?.customer_id) {
        await org.updateCustomer(order.customer_id, {
          shipping_address: address,
          billing_address: address,
        });
      }
      if (order) updateOrder(order.id, { drop_address: address });
      setStops((prev) => prev.map((s) => (
        s.stop_id === addressStop.stop_id ? { ...s, address } : s
      )));
      return;
    }
    const warehouseId = addressStop.warehouse_id || order?.pickup_warehouse_id;
    if (warehouseId) {
      await org.updateWarehouse(warehouseId, {
        address: {
          line1: address.line1,
          city: address.city,
          state: address.state,
          pincode: address.pincode,
        },
      });
    }
    if (warehouseId) {
      orders
        .filter(o => o.pickup_warehouse_id === warehouseId)
        .forEach(o => updateOrder(o.id, { pickup_address: address }));
    } else if (order) {
      updateOrder(order.id, { pickup_address: address });
    }
    setStops((prev) => prev.map((s) => (
      s.stop_id === addressStop.stop_id ? { ...s, address } : s
    )));
  }

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

  const eligibleOrderIds = selectedOrderIds.filter((id) => {
    const order = orders.find(o => o.id === id);
    return order?.status === 'Pending Consolidation' && !order.execution_plan_id;
  });

  async function handlePublish() {
    if (!eligibleOrderIds.length) {
      toast.error('Select pending orders that are not already on a plan.');
      return;
    }
    if (eligibleOrderIds.length < selectedOrderIds.length) {
      toast.error('Some selected orders are already on a plan. Only pending orders can be published.');
      return;
    }
    const missing = stops.find(s => isAddressIncomplete(s.address));
    if (missing) {
      setAddressStopId(missing.stop_id);
      toast.error(
        missing.type === 'drop'
          ? 'Add the client delivery address before converting'
          : 'Add the pickup address before converting',
      );
      return;
    }
    setConfirmOpen(true);
  }

  async function handleConfirmPublish(supplierTargetInr: number) {
    setPublishing(true);
    try {
      const plan = createExecutionPlan(eligibleOrderIds, stops, route, allocations, constraints, metrics);
      await publishExecutionPlan(plan.id, plan, { supplierTargetInr });
      setConfirmOpen(false);
      toast.success('Indent created. Review it on the plan, then Share to Operations when ready.');
      navigate(`/execution-plans?plan=${encodeURIComponent(plan.id)}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to publish execution plan');
    } finally {
      setPublishing(false);
    }
  }

  const topRec = mergeRecommendations[0];

  return (
    <div className="container-fluid">
      <PageToolbar
        title="Execution Plan Builder"
        breadcrumb={['Commerce', 'Orders', 'Plan Builder']}
        description="Merge selected orders into stops, route, and allocations. Convert to Indent when the plan is ready. Do not share to Operations from here."
      />

      {topRec && !previewPlan && (
        <AiInsightCard
          className="mb-3"
          agent="Planning Agent"
          lottie="merge"
          title={topRec.title}
          description="Optimize utilization and cost before converting to indent."
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
                  <input type="checkbox" checked={selectedOrderIds.includes(o.id)} onChange={() => handleToggleOrder(o.id)} className="mt-0.5 size-3.5 accent-primary" />
                  <div className="min-w-0">
                    <p className="text-2sm font-medium truncate">{o.order_number}</p>
                    <p className="text-2xs text-muted-foreground truncate">{o.customer_name} · {o.total_weight_kg} kg</p>
                  </div>
                </label>
              ))}
              {filtered.length === 0 && (
                <p className="px-3 py-4 text-2xs text-muted-foreground">No pending orders</p>
              )}
            </div>
          </CardShell>

          <CardShell title="Completed plans">
            <div className="max-h-[280px] overflow-y-auto divide-y divide-border">
              {savedPlans.length === 0 ? (
                <p className="px-3 py-4 text-2xs text-muted-foreground">No saved plans yet</p>
              ) : (
                savedPlans.map(plan => {
                  const exec = findCommerceExecutionForPlan(commerceExecutions, plan);
                  const label = planLifecycleLabel(planLifecycleKind(plan.status, exec, plan.indent_id));
                  const active = previewPlanId === plan.id;
                  return (
                    <button
                      key={plan.id}
                      type="button"
                      onClick={() => handlePreviewPlan(plan.id)}
                      className={`w-full text-left px-3 py-2 hover:bg-muted/40 ${active ? 'bg-[var(--pulse-brand-soft)] border-s-2 border-s-primary' : ''}`}
                    >
                      <p className="text-2sm font-medium font-mono truncate">{plan.plan_number}</p>
                      <p className="text-2xs text-muted-foreground truncate">
                        {label} · {plan.total_orders} order{plan.total_orders !== 1 ? 's' : ''}
                        {plan.indent_code ? ` · ${plan.indent_code}` : ''}
                      </p>
                    </button>
                  );
                })
              )}
            </div>
          </CardShell>
        </div>

        <div className="xl:col-span-5 flex flex-col gap-3 min-w-0">
          <CardShell title="Stops (definitions)">
            <div className="p-3">
              <RouteTimeline
                stops={displayStops}
                emptyHint={emptyRouteHint}
                onMissingAddress={previewPlan ? undefined : stop => setAddressStopId(stop.stop_id)}
              />
            </div>
          </CardShell>

          <CardShell title="Route (optimized sequence)">
            <div className="p-3">
              <RouteTimeline
                stops={displayStops}
                sequence={displayRoute.sequence}
                emptyHint={emptyRouteHint}
                onMissingAddress={previewPlan ? undefined : stop => setAddressStopId(stop.stop_id)}
              />
            </div>
            {orderedStops.length > 0 && (
              <div className="border-t border-border divide-y divide-border">
                {orderedStops.map((s, idx) => (
                  <div key={s.stop_id} className="flex items-center gap-2 px-3 py-1.5">
                    <div className="flex-1 text-2sm font-medium truncate">{s.label}</div>
                    {!previewPlan ? (
                      <div className="flex flex-col">
                        <button type="button" onClick={() => setRoute(reorderRoute(route, idx, -1))} className="p-0.5 hover:bg-muted rounded"><ArrowUp className="size-3" /></button>
                        <button type="button" onClick={() => setRoute(reorderRoute(route, idx, 1))} className="p-0.5 hover:bg-muted rounded"><ArrowDown className="size-3" /></button>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </CardShell>

          <CardShell title="Shipment allocations">
            <div className="p-3 space-y-1.5">
              {displayAllocations.length === 0 ? (
                <p className="text-2xs text-muted-foreground">No allocations</p>
              ) : displayAllocations.map(a => {
                const o = orders.find(x => x.id === a.order_id);
                const pu = getStopById(displayStops, a.pickup_stop_id);
                const dr = getStopById(displayStops, a.drop_stop_id);
                return (
                  <div key={a.allocation_id} className="rounded-md border px-2.5 py-1.5 text-2xs">
                    <span className="font-medium">{o?.order_number ?? a.order_id}</span>
                    <span className="text-muted-foreground"> · {pu?.label} → {dr?.label}</span>
                  </div>
                );
              })}
            </div>
          </CardShell>
        </div>

        <div className="xl:col-span-3 flex flex-col gap-3 min-w-0 xl:sticky xl:top-[calc(var(--header-total-height)+0.75rem)]">
          <CardShell title={previewPlan ? 'Plan preview' : 'Selected'}>
            <div className="p-3 space-y-2">
              {previewPlan ? (
                <>
                  <p className="text-sm font-mono font-bold truncate">{previewPlan.plan_number}</p>
                  <p className="text-2xs text-muted-foreground">{previewLifecycle}</p>
                  <Row label="Orders" value={String(previewPlan.total_orders)} />
                  <Row icon={Weight} label="Weight" value={`${previewPlan.total_weight_kg.toFixed(1)} kg`} />
                  <Row icon={Truck} label="Vehicle" value={displayConstraints.vehicle_type ?? '—'} />
                  <Row label="Indent" value={previewPlan.indent_code ?? previewExec?.indent?.indentNumber ?? '—'} />
                  {displayMetrics.merge_score != null && (
                    <Row label="Merge score" value={String(displayMetrics.merge_score)} />
                  )}
                  <button type="button" onClick={() => setPreviewPlanId(null)} className="text-2xs text-muted-foreground hover:text-destructive">Clear preview</button>
                </>
              ) : (
                <>
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
                </>
              )}
            </div>
          </CardShell>

          <CardShell title="Execution constraints">
            <div className="p-3 grid grid-cols-2 gap-1.5">
              <Constraint label="Vehicle" value={displayConstraints.vehicle_type ?? '—'} icon={Truck} />
              <Constraint label="Temp" value={displayConstraints.temperature} icon={Thermometer} />
              <Constraint label="Max weight" value={`${displayConstraints.max_weight_kg} kg`} icon={Weight} />
              <Constraint label="Max volume" value={`${displayConstraints.max_volume_m3} m³`} />
              <Constraint label="SLA" value={`${displayConstraints.delivery_sla_hours}h`} />
              <Constraint label="Fragile" value={displayConstraints.fragile ? 'Yes' : 'No'} icon={Shield} />
            </div>
          </CardShell>

          {previewPlan ? (
            <Button className="w-full" size="md" variant="outline" onClick={() => navigate(`/execution-plans?plan=${encodeURIComponent(previewPlan.id)}`)}>
              Open plan details
            </Button>
          ) : (
            <Button className="w-full" size="md" disabled={!eligibleOrderIds.length || publishing} onClick={handlePublish}>
              {publishing ? <Loader2 className="size-3.5 animate-spin" /> : <GitMerge className="size-3.5" />}
              Convert to Indent
            </Button>
          )}

          {previewPayload && !previewPlan && (
            <CardShell title="Gateway command">
              <button type="button" onClick={() => setShowPayload(v => !v)} className="w-full text-left px-3 py-1.5 text-3xs text-muted-foreground font-mono">
                POST {gatewayPath('execution', '/execution-plans')} {showPayload ? '▲' : '▼'}
              </button>
              {showPayload && <pre className="px-2.5 pb-2.5 text-3xs overflow-x-auto max-h-40 font-mono">{JSON.stringify(previewPayload, null, 2)}</pre>}
            </CardShell>
          )}
        </div>
      </div>

      <PublishPlanConfirmDialog
        open={confirmOpen}
        salesInvoiceInr={selected.reduce((s, o) => s + o.total_amount, 0)}
        orderCount={eligibleOrderIds.length}
        publishing={publishing}
        onClose={() => { if (!publishing) setConfirmOpen(false); }}
        onConfirm={handleConfirmPublish}
      />

      <StopAddressDialog
        open={Boolean(addressStop)}
        stop={addressStop}
        partyName={
          addressStop?.type === 'drop'
            ? orderForStop(addressStop)?.customer_name
            : org.warehouses.find(w => w.id === addressStop?.warehouse_id)?.name
        }
        onClose={() => {
          if (addressStopId) {
            setSkippedStopIds((prev) => (
              prev.includes(addressStopId) ? prev : [...prev, addressStopId]
            ));
          }
          setAddressStopId(null);
        }}
        onSave={handleSaveStopAddress}
      />
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
