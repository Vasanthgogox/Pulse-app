import type {
  ExecutionConstraints,
  ExecutionPlan,
  ExecutionRoute,
  Order,
  PlanStop,
  ShipmentAllocation,
} from '@/types/commerce';
import type { EntityMetadata, TenantContext } from '@/types/platform';
import { gatewayRequest } from '@/lib/platform-gateway';
import { createEntityMetadata } from '@/lib/entity-metadata';

/**
 * Commerce → Pulse Gateway → Execution
 * Commerce publishes an Execution Plan; Execution creates the dispatch job.
 */
export interface PublishExecutionPlanCommand {
  tenant:            TenantContext;
  meta:              EntityMetadata;
  executionPlanId:   string;
  planNumber:        string;
  vehicleType:       string;
  stops:             PublishStopPayload[];
  route:             { sequence: string[] };
  allocations:       PublishAllocationPayload[];
  orders:            PublishOrderPayload[];
  constraints:       ExecutionConstraints;
  summary: {
    orderCount:      number;
    totalAmount:     number;
    totalWeightKg:   number;
    totalVolumeM3:   number;
    mergeScore?:     number;
    currency:        string;
  };
}

export interface PublishStopPayload {
  stopId:      string;
  label:       string;
  type:        'pickup' | 'drop';
  warehouseId?: string;
  address:     PlanStop['address'];
  contact:     { name: string; phone: string };
  podRequired: boolean;
}

export interface PublishAllocationPayload {
  allocationId:  string;
  orderId:       string;
  pickupStopId:  string;
  dropStopId:    string;
  weightKg:      number;
  volumeM3:      number;
  description?:  string;
}

export interface PublishOrderPayload {
  orderId:     string;
  orderNumber: string;
  customer:    { id: string; name: string; email: string };
  lineItems:   { sku: string; name: string; qty: number; unitPrice: number }[];
  amount:      number;
  weightKg:    number;
  volumeM3:    number;
}

/** @deprecated Use PublishExecutionPlanCommand */
export type PublishExecutionPlanPayload = PublishExecutionPlanCommand;

export function buildPublishExecutionPlanPayload(
  plan: ExecutionPlan,
  orders: Order[],
  tenant: TenantContext,
  createdBy: string,
): PublishExecutionPlanCommand {
  const orderById = new Map(orders.map(o => [o.id, o]));
  const meta = plan.meta ?? createEntityMetadata({
    id: plan.id,
    status: plan.status,
    tenant,
    source: 'commerce',
    createdBy,
    createdAt: plan.created_at,
    updatedAt: plan.updated_at,
  });

  return {
    tenant,
    meta,
    executionPlanId: plan.id,
    planNumber:      plan.plan_number,
    vehicleType:     plan.constraints.vehicle_type ?? '32FT',
    stops: plan.stops.map(s => ({
      stopId:      s.stop_id,
      label:       s.label,
      type:        s.type,
      warehouseId: s.warehouse_id,
      address:     s.address,
      contact:     { name: s.contact_name, phone: s.contact_phone },
      podRequired: s.pod_required,
    })),
    route: { sequence: plan.route.sequence },
    allocations: plan.allocations.map(a => ({
      allocationId: a.allocation_id,
      orderId:      a.order_id,
      pickupStopId: a.pickup_stop_id,
      dropStopId:   a.drop_stop_id,
      weightKg:     a.weight_kg,
      volumeM3:     a.volume_m3,
      description:  a.description,
    })),
    orders: plan.order_ids
      .map(id => orderById.get(id))
      .filter((o): o is Order => Boolean(o))
      .map(o => ({
        orderId:     o.id,
        orderNumber: o.order_number,
        customer:    { id: o.customer_id, name: o.customer_name, email: o.customer_email },
        lineItems:   o.line_items.map(li => ({
          sku: li.sku, name: li.product_name, qty: li.qty, unitPrice: li.unit_price,
        })),
        amount:   o.total_amount,
        weightKg: o.total_weight_kg,
        volumeM3: o.total_volume_m3,
      })),
    constraints: plan.constraints,
    summary: {
      orderCount:    plan.total_orders,
      totalAmount:   plan.total_amount,
      totalWeightKg: plan.total_weight_kg,
      totalVolumeM3: plan.total_volume_m3,
      mergeScore:    plan.optimization?.merge_score,
      currency:      'INR',
    },
  };
}

/** POST gateway → execution /execution-plans */
export async function publishPlanToExecution(
  command: PublishExecutionPlanCommand,
  correlationId?: string,
): Promise<{ accepted: boolean; referenceId: string; correlationId: string }> {
  const response = await gatewayRequest<{ referenceId: string }>({
    service: 'execution',
    path:    '/execution-plans',
    method:  'POST',
    body:    command,
    tenant:  command.tenant,
    correlationId,
    idempotencyKey: command.executionPlanId,
  });

  return {
    accepted:      response.ok,
    referenceId:   response.data?.referenceId ?? `EXEC-${command.planNumber}`,
    correlationId: response.correlationId,
  };
}

export function buildRouteFromStops(stops: PlanStop[]): ExecutionRoute {
  return { sequence: stops.map(s => s.stop_id) };
}
