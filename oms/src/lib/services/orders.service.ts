import { getIdentityDb as getSupabase } from '@/lib/supabase';
import type { Order, OrderLineItem, OrderStatus } from '@/types/commerce';

// ─── DB row shapes ────────────────────────────────────────────────────────────
interface OrderRow {
  id: string;
  order_number: string;
  organization_id: string;
  status: string;
  priority: string;
  source: string;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  total_weight_kg: number;
  total_volume_m3: number;
  notes: string | null;
  execution_plan_id: string | null;
  delivery_window_start: string | null;
  delivery_window_end: string | null;
  created_at: string;
  updated_at: string;
  // joined
  customer: { id: string; name: string; legal_name: string | null; trade_name: string | null; email: string | null } | null;
  pickup_warehouse: { id: string; name: string; address: string | null; city: string | null; state: string | null; pincode: string | null; latitude: number | null; longitude: number | null } | null;
  drop_warehouse: { id: string; name: string; address: string | null; city: string | null; state: string | null; pincode: string | null; latitude: number | null; longitude: number | null } | null;
  lines: OrderLineRow[];
}

interface OrderLineRow {
  id: string;
  product_id: string;
  quantity: number;
  allocated_quantity: number;
  unit_price: number;
  tax_rate: number;
  line_total: number;
  weight_kg: number;
  volume_m3: number;
  product: { id: string; name: string; sku: string } | null;
}

function rowToOrder(row: OrderRow): Order {
  const customer = row.customer;
  const pickup = row.pickup_warehouse;
  const drop = row.drop_warehouse ?? row.pickup_warehouse;
  return {
    id:             row.id,
    order_number:   row.order_number,
    customer_id:    customer?.id ?? '',
    customer_name:  customer?.legal_name ?? customer?.trade_name ?? customer?.name ?? 'Unknown',
    customer_email: customer?.email ?? '',
    status:         row.status as OrderStatus,
    pickup_warehouse_id: pickup?.id ?? '',
    pickup_address: {
      line1:   pickup?.address ?? '',
      city:    pickup?.city ?? '',
      state:   pickup?.state ?? '',
      pincode: pickup?.pincode ?? '',
      lat:     pickup?.latitude ?? undefined,
      lng:     pickup?.longitude ?? undefined,
    },
    drop_address: {
      line1:   drop?.address ?? '',
      city:    drop?.city ?? '',
      state:   drop?.state ?? '',
      pincode: drop?.pincode ?? '',
      lat:     drop?.latitude ?? undefined,
      lng:     drop?.longitude ?? undefined,
    },
    line_items: (row.lines ?? []).map(l => ({
      id:           l.id,
      product_id:   l.product_id,
      product_name: l.product?.name ?? '',
      sku:          l.product?.sku ?? '',
      qty:          l.quantity,
      unit_price:   l.unit_price,
      total:        l.line_total,
      weight_kg:    l.weight_kg,
      volume_m3:    l.volume_m3,
    } satisfies OrderLineItem)),
    total_amount:    row.total_amount,
    total_weight_kg: row.total_weight_kg,
    total_volume_m3: row.total_volume_m3,
    delivery_window: row.delivery_window_start
      ? { start: row.delivery_window_start, end: row.delivery_window_end ?? row.delivery_window_start }
      : undefined,
    priority:          row.priority as Order['priority'],
    notes:             row.notes ?? undefined,
    source:            row.source as Order['source'],
    execution_plan_id: row.execution_plan_id ?? undefined,
    created_at:        row.created_at,
    updated_at:        row.updated_at,
  };
}

const ORDER_SELECT = `
  id, order_number, organization_id, status, priority, source,
  subtotal, tax_amount, total_amount, total_weight_kg, total_volume_m3,
  notes, execution_plan_id, delivery_window_start, delivery_window_end,
  created_at, updated_at,
  customer:clients!customer_id(id,name,legal_name,trade_name,email),
  pickup_warehouse:client_warehouses!pickup_warehouse_id(id,name,address,city,state,pincode,latitude,longitude),
  drop_warehouse:client_warehouses!drop_warehouse_id(id,name,address,city,state,pincode,latitude,longitude),
  lines:sales_order_lines(id,product_id,quantity,allocated_quantity,unit_price,tax_rate,line_total,weight_kg,volume_m3,product:products!product_id(id,name,sku))
`.trim();

export async function fetchOrders(organizationId: string): Promise<Order[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data, error } = await sb
    .from('sales_orders')
    .select(ORDER_SELECT)
    .eq('organization_id', organizationId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data as unknown as OrderRow[]).map(rowToOrder);
}

export interface CreateOrderInput {
  organization_id: string;
  customer_id: string;
  pickup_warehouse_id: string;
  drop_warehouse_id?: string;
  priority?: string;
  source?: string;
  notes?: string;
  delivery_window_start?: string;
  delivery_window_end?: string;
  lines: {
    product_id: string;
    quantity: number;
    unit_price: number;
    tax_rate?: number;
    weight_kg?: number;
    volume_m3?: number;
  }[];
}

export async function createOrder(input: CreateOrderInput): Promise<Order> {
  const sb = getSupabase();
  if (!sb) throw new Error('Supabase not configured');

  // Generate order number via RPC
  const { data: orderNumber, error: seqErr } = await sb.rpc('next_order_number', {
    p_org_id: input.organization_id,
  });
  if (seqErr) throw seqErr;

  // Compute totals from lines
  const subtotal = input.lines.reduce((s, l) => {
    const lineBase = l.quantity * l.unit_price;
    return s + lineBase;
  }, 0);
  const tax_amount = input.lines.reduce((s, l) => {
    const tax = l.tax_rate ?? 18;
    return s + (l.quantity * l.unit_price * tax / 100);
  }, 0);
  const total_amount = subtotal + tax_amount;
  const total_weight_kg = input.lines.reduce((s, l) => s + ((l.weight_kg ?? 0) * l.quantity), 0);
  const total_volume_m3 = input.lines.reduce((s, l) => s + ((l.volume_m3 ?? 0) * l.quantity), 0);

  const { data: order, error: ordErr } = await sb
    .from('sales_orders')
    .insert({
      order_number:          orderNumber,
      organization_id:       input.organization_id,
      customer_id:           input.customer_id,
      pickup_warehouse_id:   input.pickup_warehouse_id,
      drop_warehouse_id:     input.drop_warehouse_id,
      priority:              input.priority ?? 'standard',
      source:                input.source ?? 'Manual',
      notes:                 input.notes,
      delivery_window_start: input.delivery_window_start,
      delivery_window_end:   input.delivery_window_end,
      status:                'Draft',
      subtotal,
      tax_amount,
      total_amount,
      total_weight_kg,
      total_volume_m3,
    })
    .select('id')
    .single();
  if (ordErr) throw ordErr;

  const lineRows = input.lines.map(l => {
    const taxRate = l.tax_rate ?? 18;
    const lineBase = l.quantity * l.unit_price;
    const lineTax  = lineBase * taxRate / 100;
    return {
      organization_id: input.organization_id,
      sales_order_id:  order.id,
      product_id:      l.product_id,
      quantity:        l.quantity,
      unit_price:      l.unit_price,
      tax_rate:        taxRate,
      line_total:      lineBase + lineTax,
      weight_kg:       (l.weight_kg ?? 0) * l.quantity,
      volume_m3:       (l.volume_m3 ?? 0) * l.quantity,
    };
  });
  const { error: lineErr } = await sb.from('sales_order_lines').insert(lineRows);
  if (lineErr) throw lineErr;

  // Fetch full order with joins
  const { data: full, error: fetchErr } = await sb
    .from('sales_orders')
    .select(ORDER_SELECT)
    .eq('id', order.id)
    .single();
  if (fetchErr) throw fetchErr;
  return rowToOrder(full as unknown as OrderRow);
}

export async function updateOrderStatus(orderId: string, status: OrderStatus, executionPlanId?: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) throw new Error('Supabase not configured');
  const patch: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
  if (executionPlanId !== undefined) patch['execution_plan_id'] = executionPlanId;
  const { error } = await sb.from('sales_orders').update(patch).eq('id', orderId);
  if (error) throw error;
}

export async function deleteOrder(id: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) throw new Error('Supabase not configured');
  const { error } = await sb
    .from('sales_orders')
    .update({ deleted_at: new Date().toISOString(), status: 'Cancelled' })
    .eq('id', id);
  if (error) throw error;
}
