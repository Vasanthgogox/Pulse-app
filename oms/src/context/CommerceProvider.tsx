import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type {
  CommerceContextValue,
  DashboardStats,
  ExecutionConstraints,
  ExecutionPlan,
  ExecutionRoute,
  MergeOptimizationMetrics,
  Order,
  OrderStatus,
  PlanStop,
  ShipmentAllocation,
} from '@/types/commerce';
import { DEFAULT_TENANT } from '@/types/platform';
import { useOrganization } from '@/context/OrganizationProvider';
import { useUserProfile } from '@/hooks/useUserProfile';
import { buildPublishExecutionPlanPayload, publishPlanToExecution } from '@/lib/execution-api';
import { shareExecutionPlanToOperations } from '@/lib/execution-service-client';
import { createEntityMetadata, bumpEntityVersion } from '@/lib/entity-metadata';
import { findMergeRecommendations } from '@/lib/merge-engine';
import { subscribePlatformEvents, type PlatformEventEnvelope } from '@/lib/domain-events';
import { fetchOrders } from '@/lib/services/orders.service';
import { getPlatformEventBus } from '@pulse-platform/index';
import { loadOrders, loadPlans, saveOrders, savePlans } from '@/lib/order-store';

const CommerceContext = createContext<CommerceContextValue | undefined>(undefined);

const EMPTY_STATS: DashboardStats = {
  total_orders: 0,
  pending_orders: 0,
  published_plans: 0,
  fulfilled_today: 0,
  total_revenue: 0,
  avg_order_value: 0,
  orders_this_month: 0,
  revenue_this_month: 0,
};

export function CommerceProvider({ children }: { children: ReactNode }) {
  const org = useOrganization();
  const { user, displayName, email, role } = useUserProfile();
  const [orders, setOrdersRaw] = useState<Order[]>(() => loadOrders());
  const [plans, setPlansRaw]   = useState<ExecutionPlan[]>(() => loadPlans());

  const setOrders = useCallback((updater: Order[] | ((prev: Order[]) => Order[])) => {
    setOrdersRaw(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      saveOrders(next);
      return next;
    });
  }, []);

  const setPlans = useCallback((updater: ExecutionPlan[] | ((prev: ExecutionPlan[]) => ExecutionPlan[])) => {
    setPlansRaw(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      savePlans(next);
      return next;
    });
  }, []);
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);

  const refreshOrders = useCallback(async () => {
    const wsId = org.platformOrganization?.id;
    if (!wsId) return;
    try {
      const rows = await fetchOrders(wsId);
      setOrders(rows);
    } catch {
      // Keep local cache if remote fetch fails (e.g. migration not applied yet).
    }
  }, [org.platformOrganization?.id, setOrders]);

  useEffect(() => {
    if (!org.organizationHydrated || !org.platformOrganization?.id) return;
    void refreshOrders();
  }, [org.organizationHydrated, org.platformOrganization?.id, refreshOrders]);

  useEffect(() => {
    return getPlatformEventBus().subscribe('IndentCreated', (event) => {
      const payload = event.payload as { orderId?: string };
      if (!payload.orderId) return;
      setOrders(prev => prev.map(o =>
        o.id === payload.orderId
          ? { ...o, status: 'Planned' as OrderStatus, updated_at: new Date().toISOString() }
          : o,
      ));
    });
  }, [setOrders]);

  const tenant = DEFAULT_TENANT;
  const identity = {
    company: {
      id: org.platformOrganization?.id ?? org.profile?.id ?? tenant.organizationId,
      name: org.platformOrganization?.name ?? org.profile?.name ?? 'Your Organization',
      tenantId: tenant.tenantId,
      type: 'shipper' as const,
    },
    user: {
      id: user?.id ?? 'anonymous',
      email: email || 'user@pulse.app',
      name: displayName,
      role: (role ?? 'commerce_manager') as 'commerce_manager',
    },
    teams: [],
  };

  useEffect(() => {
    return subscribePlatformEvents((event: PlatformEventEnvelope) => {
      if (event.eventName === 'SettlementCompleted') {
        const payload = event.payload as { planId?: string; orderIds?: string[] };
        if (!payload.planId) return;
        setPlans(prev => prev.map(p =>
          p.id === payload.planId || p.correlation_id === event.correlationId
            ? { ...p, status: 'fulfilled', lifecycle_stage: 'commerce_updated', journey_in_progress: false, updated_at: new Date().toISOString() }
            : p,
        ));
        if (payload.orderIds?.length) {
          setOrders(prev => prev.map(o =>
            payload.orderIds!.includes(o.id)
              ? { ...o, status: 'Fulfilled' as OrderStatus, updated_at: new Date().toISOString() }
              : o,
          ));
        }
      }
    });
  }, []);

  const stats = useMemo((): DashboardStats => {
    const pending = orders.filter(o => o.status === 'Pending Consolidation').length;
    const revenue = orders.reduce((s, o) => s + o.total_amount, 0);
    return {
      total_orders: orders.length,
      pending_orders: pending,
      published_plans: plans.filter(p => p.status === 'published' || p.status === 'fulfilled').length,
      fulfilled_today: orders.filter(o => o.status === 'Fulfilled').length,
      total_revenue: revenue,
      avg_order_value: orders.length ? revenue / orders.length : 0,
      orders_this_month: orders.length,
      revenue_this_month: revenue,
    };
  }, [orders, plans]);

  const mergeRecommendations = useMemo(
    () => findMergeRecommendations(orders.filter(o => o.status === 'Pending Consolidation')),
    [orders],
  );

  const toggleOrderSelection = useCallback((id: string) => {
    setSelectedOrderIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }, []);

  const clearOrderSelection = useCallback(() => setSelectedOrderIds([]), []);

  const selectAllPendingOrders = useCallback(() => {
    setSelectedOrderIds(orders.filter(o => o.status === 'Pending Consolidation').map(o => o.id));
  }, [orders]);

  const applyMergeRecommendation = useCallback((recId: string) => {
    const rec = findMergeRecommendations(orders.filter(o => o.status === 'Pending Consolidation'))
      .find(r => r.id === recId);
    if (rec) setSelectedOrderIds(rec.order_ids);
  }, [orders]);

  const updateOrderStatus = useCallback((orderId: string, status: OrderStatus) => {
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status, updated_at: new Date().toISOString() } : o));
  }, [setOrders]);

  const updateOrder = useCallback((orderId: string, patch: Partial<Order>) => {
    setOrders(prev => prev.map(o =>
      o.id === orderId ? { ...o, ...patch, updated_at: new Date().toISOString() } : o,
    ));
  }, [setOrders]);

  const deleteOrder = useCallback((orderId: string) => {
    setOrders(prev => prev.filter(o => o.id !== orderId));
    setSelectedOrderIds(prev => prev.filter(id => id !== orderId));
  }, [setOrders]);

  const addOrder = useCallback((order: Order) => {
    setOrders(prev => [order, ...prev]);
  }, [setOrders]);

  const createExecutionPlan = useCallback((
    orderIds: string[],
    stops: PlanStop[],
    route: ExecutionRoute,
    allocations: ShipmentAllocation[],
    constraints: ExecutionConstraints,
    optimization?: MergeOptimizationMetrics,
  ): ExecutionPlan => {
    const selected = orders.filter(o => orderIds.includes(o.id));
    const blocked = selected.filter(
      o => o.status !== 'Pending Consolidation' || Boolean(o.execution_plan_id),
    );
    if (blocked.length) {
      throw new Error(
        `Already on a plan — cannot publish again: ${blocked.map(o => o.order_number).join(', ')}`,
      );
    }
    if (!selected.length) {
      throw new Error('Select pending orders that are not already on a plan.');
    }
    const id = `PLN${String(plans.length + 1).padStart(3, '0')}`;
    const now = new Date().toISOString();
    const plan: ExecutionPlan = {
      id,
      plan_number: `EP-2026-${String(plans.length + 1).padStart(3, '0')}`,
      meta: createEntityMetadata({ id, status: 'ready', tenant, source: 'commerce', createdBy: identity.user.name }),
      status: 'ready',
      origin: 'customer_orders',
      stops, route, allocations, constraints,
      order_ids: orderIds,
      total_orders: orderIds.length,
      total_amount: selected.reduce((s, o) => s + o.total_amount, 0),
      total_weight_kg: selected.reduce((s, o) => s + o.total_weight_kg, 0),
      total_volume_m3: selected.reduce((s, o) => s + o.total_volume_m3, 0),
      optimization,
      lifecycle_stage: 'plan_created',
      created_by: identity.user.name,
      created_at: now,
      updated_at: now,
    };
    setPlans(prev => [plan, ...prev]);
    setOrders(prev => prev.map(o =>
      orderIds.includes(o.id)
        ? { ...o, status: 'Planned' as OrderStatus, execution_plan_id: plan.id, updated_at: now }
        : o,
    ));
    setSelectedOrderIds([]);
    return plan;
  }, [orders, plans, tenant, identity.user.name]);

  const publishExecutionPlan = useCallback(async (
    planId: string,
    planSnapshot?: ExecutionPlan,
    options?: { supplierTargetInr?: number },
  ) => {
    const plan = planSnapshot ?? plans.find(p => p.id === planId);
    if (!plan) throw new Error('Plan not found');
    const supplierTargetInr = options?.supplierTargetInr;
    const supplierTarget = supplierTargetInr != null && supplierTargetInr > 0
      ? supplierTargetInr
      : 0;

    const command = buildPublishExecutionPlanPayload(
      plan, orders, tenant, identity.user.name,
      org.platformOrganization?.id ?? '', user?.id ?? '',
      supplierTarget,
    );
    const result = await publishPlanToExecution(command);

    setPlans(prev => {
      const list = prev.some(p => p.id === planId)
        ? prev
        : planSnapshot
          ? [planSnapshot, ...prev]
          : prev;

      return list.map(p => {
      if (p.id !== planId) return p;
      const meta = p.meta
        ? bumpEntityVersion(p.meta, 'ready')
        : createEntityMetadata({ id: p.id, status: 'ready', tenant, source: 'commerce', createdBy: identity.user.name });
      return {
        ...p, meta,
        status: 'ready',
        correlation_id: result.correlationId,
        indent_id: result.indentId || p.indent_id,
        indent_code: result.indentCode || p.indent_code,
        core_plan_id: result.executionPlanId || p.core_plan_id,
        lifecycle_stage: 'indent_created',
        updated_at: new Date().toISOString(),
      };
    });
    });
    return {
      indentId: result.indentId,
      indentCode: result.indentCode,
      executionPlanId: result.executionPlanId,
    };
  }, [plans, orders, tenant, identity.user.name, org.platformOrganization?.id, user?.id]);

  const sharePlanToOperations = useCallback(async (planId: string) => {
    // planId may be a locally-cached plan's id, OR (when this plan/indent was
    // opened in a session that never populated the local order-store cache —
    // see CommerceIndentHandoff.onShare) the real Core execution_plans.id
    // directly. shareExecutionPlanToOperations is fully DB-backed
    // (ExecutionOrchestrator.shareExecutionPlanToOperations resolves by
    // findById OR findByClientPlanId), so no local plan record is required —
    // it's only used here to update the optimistic local cache afterward.
    const plan = plans.find(p => p.id === planId || p.core_plan_id === planId);
    const workspaceId = org.platformOrganization?.id;
    if (!workspaceId) throw new Error('Organization not ready');
    await shareExecutionPlanToOperations({
      workspaceId,
      executionPlanId: plan?.core_plan_id || plan?.id || planId,
    });
    if (!plan) return;
    setPlans(prev => prev.map(p => {
      if (p.id !== planId) return p;
      return {
        ...p,
        status: 'published',
        published_at: p.published_at ?? new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
    }));
  }, [plans, org.platformOrganization?.id]);

  return (
    <CommerceContext.Provider value={{
      tenant,
      identity,
      orders,
      plans,
      products: org.products,
      customers: org.customers,
      warehouses: org.warehouses,
      stats: org.hasPlatformOrganization ? stats : EMPTY_STATS,
      mergeRecommendations,
      selectedOrderIds,
      setSelectedOrderIds,
      toggleOrderSelection,
      clearOrderSelection,
      selectAllPendingOrders,
      applyMergeRecommendation,
      createExecutionPlan,
      publishExecutionPlan,
      sharePlanToOperations,
      updateOrderStatus,
      updateOrder,
      deleteOrder,
      addOrder,
      refreshOrders,
    }}>
      {children}
    </CommerceContext.Provider>
  );
}

export function useCommerce(): CommerceContextValue {
  const ctx = useContext(CommerceContext);
  if (!ctx) throw new Error('useCommerce must be used inside CommerceProvider');
  return ctx;
}

export const useOms = useCommerce;
export const OmsProvider = CommerceProvider;
