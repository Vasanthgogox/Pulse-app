import type {
  ExecutionConstraints,
  ExecutionRoute,
  MergeOptimizationMetrics,
  MergeRecommendation,
  Order,
  PlanStop,
  ShipmentAllocation,
} from '@/types/commerce';

const PICKUP_LABELS = 'ABCDEFGHIJ'.split('');
const DROP_LABELS   = 'CDEFGHIJKLMNOP'.split('');

export function suggestVehicle(weightKg: number): string {
  if (weightKg <= 500)   return 'TATA ACE';
  if (weightKg <= 1500)  return '14FT';
  if (weightKg <= 5000)  return '20FT';
  if (weightKg <= 12000) return '32FT';
  return '40FT';
}

function capacityForVehicle(vehicle: string): { weight: number; volume: number } {
  const caps: Record<string, { weight: number; volume: number }> = {
    'TATA ACE': { weight: 750,    volume: 4 },
    '14FT':     { weight: 3500,   volume: 18 },
    '20FT':     { weight: 7500,   volume: 36 },
    '32FT':     { weight: 14000,  volume: 72 },
    '40FT':     { weight: 22000,  volume: 90 },
  };
  return caps[vehicle] ?? { weight: 10000, volume: 50 };
}

export function buildDefaultConstraints(orders: Order[]): ExecutionConstraints {
  const weight = orders.reduce((s, o) => s + o.total_weight_kg, 0);
  const volume = orders.reduce((s, o) => s + o.total_volume_m3, 0);
  const vehicle = suggestVehicle(weight);
  const cap = capacityForVehicle(vehicle);
  const fragile = orders.some(o => o.line_items.some(li => li.product_name.toLowerCase().includes('aid') || li.sku.startsWith('PHAR')));
  const minSla = Math.min(...orders.map(o => {
    const c = o.priority === 'critical' ? 4 : o.priority === 'express' ? 12 : 24;
    return c;
  }));

  return {
    vehicle_type:      vehicle,
    temperature:       'ambient',
    max_weight_kg:     cap.weight,
    max_volume_m3:     cap.volume,
    delivery_sla_hours: minSla,
    hazmat:            false,
    fragile,
  };
}

export function computeOptimizationMetrics(orders: Order[]): MergeOptimizationMetrics {
  if (orders.length === 0) {
    return {
      merge_score: 0, vehicle_utilization_pct: 0, distance_saved_km: 0,
      carbon_saved_kg: 0, savings_inr: 0,
      factors: { distance: 0, weight: 0, volume: 0, vehicle_fill: 0, delivery_window: 0, priority: 0, customer_sla: 0, revenue: 0, profit_margin: 0 },
    };
  }

  const weight  = orders.reduce((s, o) => s + o.total_weight_kg, 0);
  const volume  = orders.reduce((s, o) => s + o.total_volume_m3, 0);
  const revenue = orders.reduce((s, o) => s + o.total_amount, 0);
  const vehicle = suggestVehicle(weight);
  const cap     = capacityForVehicle(vehicle);

  const pickups = new Set(orders.map(o => o.pickup_address.pincode));
  const drops   = new Set(orders.map(o => o.drop_address.pincode));

  const distanceFactor    = Math.min(100, (orders.length - 1) * 14 + (orders.length - pickups.size) * 18);
  const weightFactor      = Math.min(100, (weight / cap.weight) * 100);
  const volumeFactor      = Math.min(100, (volume / cap.volume) * 100);
  const vehicleFill       = Math.min(99, Math.round(((weight / cap.weight) * 0.6 + (volume / cap.volume) * 0.4) * 100));
  const deliveryWindow    = orders.some(o => o.delivery_window) ? 72 : 45;
  const priorityFactor    = orders.filter(o => o.priority === 'express' || o.priority === 'critical').length * 20;
  const slaFactor         = orders.filter(o => o.priority === 'critical').length * 25;
  const profitMargin      = Math.min(95, Math.round((revenue * 0.18) / Math.max(orders.length, 1) / 100));

  const mergeScore = Math.min(98, Math.round(
    distanceFactor * 0.2 + weightFactor * 0.15 + volumeFactor * 0.1 +
    vehicleFill * 0.2 + deliveryWindow * 0.1 + priorityFactor * 0.05 +
    slaFactor * 0.05 + profitMargin * 0.15,
  ));

  return {
    merge_score:             mergeScore,
    vehicle_utilization_pct: vehicleFill,
    distance_saved_km:       Math.round(orders.length * 4.2 + (orders.length - pickups.size) * 8),
    carbon_saved_kg:         Math.round(orders.length * 2.8 + 4),
    savings_inr:             Math.round(orders.length * 620 + mergeScore * 18),
    estimated_profit_inr:    Math.round(revenue * 0.12),
    factors: {
      distance: distanceFactor,
      weight: weightFactor,
      volume: volumeFactor,
      vehicle_fill: vehicleFill,
      delivery_window: deliveryWindow,
      priority: priorityFactor,
      customer_sla: slaFactor,
      revenue: Math.min(100, revenue / 10000),
      profit_margin: profitMargin,
    },
  };
}

export function buildPlanGraph(orders: Order[]): {
  stops: PlanStop[];
  allocations: ShipmentAllocation[];
  route: ExecutionRoute;
} {
  const pickupMap = new Map<string, PlanStop>();
  const dropStops: PlanStop[] = [];
  const allocations: ShipmentAllocation[] = [];

  for (const order of orders) {
    const pKey = order.pickup_warehouse_id || order.pickup_address.pincode;
    if (!pickupMap.has(pKey)) {
      pickupMap.set(pKey, {
        stop_id:       `PU-${pKey}`,
        label:         `Pickup ${PICKUP_LABELS[pickupMap.size] ?? String(pickupMap.size + 1)}`,
        type:          'pickup',
        warehouse_id:  order.pickup_warehouse_id,
        address:       order.pickup_address,
        contact_name:  'Warehouse Manager',
        contact_phone: '+91 98200 00000',
        pod_required:  false,
      });
    }

    const dropStop: PlanStop = {
      stop_id:       `DR-${order.id}`,
      label:         `Drop ${DROP_LABELS[dropStops.length] ?? String(dropStops.length + 1)}`,
      type:          'drop',
      address:       order.drop_address,
      contact_name:  order.customer_name,
      contact_phone: '',
      pod_required:  true,
    };
    dropStops.push(dropStop);

    const pickupStop = pickupMap.get(pKey)!;
    allocations.push({
      allocation_id:  `SA-${order.id}`,
      order_id:       order.id,
      pickup_stop_id: pickupStop.stop_id,
      drop_stop_id:   dropStop.stop_id,
      weight_kg:      order.total_weight_kg,
      volume_m3:      order.total_volume_m3,
      description:    order.line_items.map(li => `${li.product_name} ×${li.qty}`).join(', '),
    });
  }

  const stops = [...pickupMap.values(), ...dropStops];
  return {
    stops,
    allocations,
    route: { sequence: stops.map(s => s.stop_id) },
  };
}

export function reorderRoute(route: ExecutionRoute, fromIdx: number, dir: -1 | 1): ExecutionRoute {
  const seq = [...route.sequence];
  const target = fromIdx + dir;
  if (target < 0 || target >= seq.length) return route;
  [seq[fromIdx], seq[target]] = [seq[target], seq[fromIdx]];
  return { sequence: seq };
}

export function findMergeRecommendations(pendingOrders: Order[]): MergeRecommendation[] {
  if (pendingOrders.length < 2) return [];

  const byWarehouse = new Map<string, Order[]>();
  for (const o of pendingOrders) {
    const key = o.pickup_warehouse_id;
    const g = byWarehouse.get(key) ?? [];
    g.push(o);
    byWarehouse.set(key, g);
  }

  const recs: MergeRecommendation[] = [];

  for (const [, group] of byWarehouse) {
    if (group.length < 2) continue;
    const m = computeOptimizationMetrics(group);
    recs.push({
      id: `rec-${group[0].pickup_warehouse_id}`,
      order_ids: group.map(o => o.id),
      title: `${group.length} orders from ${group[0].pickup_address.city} warehouse`,
      savings_inr: m.savings_inr,
      vehicle_utilization_pct: m.vehicle_utilization_pct,
      distance_saved_km: m.distance_saved_km,
      carbon_saved_kg: m.carbon_saved_kg,
      vehicle_suggestion: suggestVehicle(group.reduce((s, o) => s + o.total_weight_kg, 0)),
      merge_score: m.merge_score,
      suggestions: [
        `Combine ${group.length} pickups`,
        `Use ${suggestVehicle(group.reduce((s, o) => s + o.total_weight_kg, 0))}`,
        `Saves ${m.distance_saved_km} km`,
        `Saves ₹${m.savings_inr.toLocaleString('en-IN')}`,
      ],
    });
  }

  if (pendingOrders.length >= 3) {
    const m = computeOptimizationMetrics(pendingOrders);
    recs.unshift({
      id: 'rec-all',
      order_ids: pendingOrders.map(o => o.id),
      title: `We found ${pendingOrders.length} compatible orders`,
      savings_inr: Math.round(pendingOrders.length * 1840),
      vehicle_utilization_pct: m.vehicle_utilization_pct,
      distance_saved_km: 62,
      carbon_saved_kg: 17,
      vehicle_suggestion: suggestVehicle(pendingOrders.reduce((s, o) => s + o.total_weight_kg, 0)),
      merge_score: m.merge_score,
      suggestions: [
        'Optimize across all pending orders',
        `Use ${suggestVehicle(pendingOrders.reduce((s, o) => s + o.total_weight_kg, 0))}`,
        'Saves 62 km',
        `Saves ₹${(pendingOrders.length * 1840).toLocaleString('en-IN')}`,
      ],
    });
  }

  return recs.sort((a, b) => b.merge_score - a.merge_score);
}

export function getStopById(stops: PlanStop[], id: string): PlanStop | undefined {
  return stops.find(s => s.stop_id === id);
}
