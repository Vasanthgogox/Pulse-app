// Commerce domain — no logistics terminology (no indents, trips, drivers).

import type { EntityMetadata, TenantContext } from './platform';
import type { IdentityContext } from './identity';

export type OrderStatus = 'Draft' | 'Pending Consolidation' | 'Planned' | 'Fulfilled' | 'Cancelled';
export type PlanStatus  = 'draft' | 'optimizing' | 'ready' | 'published' | 'fulfilled' | 'cancelled';
export type PlanOrigin  =
  | 'customer_orders'
  | 'purchase_order'
  | 'warehouse_transfer'
  | 'store_replenishment'
  | 'returns'
  | 'cross_dock';
export type StopType    = 'pickup' | 'drop';
export type ProductCategory = 'Electronics' | 'Apparel' | 'FMCG' | 'Industrial' | 'Pharmaceuticals' | 'Food & Beverage';

export interface Address {
  line1:   string;
  city:    string;
  state:   string;
  pincode: string;
  lat?:    number;
  lng?:    number;
}

export interface Product {
  id:          string;
  sku:         string;
  name:        string;
  category:    ProductCategory;
  description: string;
  unit_price:  number;
  weight_kg:   number;
  volume_m3:   number;
  dimensions:  { l: number; w: number; h: number };
  stock:       number;
  reserved:    number;
  threshold:   number;
  rating?:     number;
  /** org-assets path or https URL */
  image_path?: string | null;
  created_at:  string;
}

export interface Warehouse {
  id:       string;
  name:     string;
  code:     string;
  address:  Address;
  capacity_m3: number;
}

export type ConsigneeEntityType = 'individual' | 'business';

export interface Customer {
  id:               string;
  name:             string;
  email:            string;
  phone:            string;
  company?:         string;
  /** Order delivery recipient — individual person or business location */
  entity_type?:     ConsigneeEntityType;
  /** Registered business name (when entity_type is business) */
  legal_name?:      string;
  gstin?:           string;
  pan?:             string;
  contact_person?:  string;
  billing_address:  Address;
  shipping_address: Address;
  sla_hours?:       number;
  priority?:        'standard' | 'express' | 'critical';
  total_orders:     number;
  total_spend:      number;
  created_at:       string;
}

/** Alias — consignee is the order end-recipient stored as Customer in CRM */
export type Consignee = Customer;

export interface OrderLineItem {
  id:           string;
  product_id:   string;
  product_name: string;
  sku:          string;
  qty:          number;
  unit_price:   number;
  total:        number;
  weight_kg:    number;
  volume_m3:    number;
}

export interface Order {
  id:              string;
  order_number:    string;
  customer_id:     string;
  customer_name:   string;
  customer_email:  string;
  status:          OrderStatus;
  pickup_warehouse_id: string;
  pickup_address:  Address;
  drop_address:    Address;
  line_items:      OrderLineItem[];
  total_amount:    number;
  total_weight_kg: number;
  total_volume_m3: number;
  delivery_window?: { start: string; end: string };
  priority?:       'standard' | 'express' | 'critical';
  notes?:          string;
  source:          'Manual' | 'Shopify' | 'WooCommerce' | 'API';
  execution_plan_id?: string;
  created_at:      string;
  updated_at:      string;
}

/** Physical/logistical constraints carried on every execution plan. */
export interface ExecutionConstraints {
  vehicle_type?:     string;
  temperature:       'ambient' | 'cold_chain' | 'frozen';
  max_weight_kg:     number;
  max_volume_m3:     number;
  delivery_sla_hours: number;
  hazmat:            boolean;
  fragile:           boolean;
}

/** Stop definition — immutable identity; route references stop IDs. */
export interface PlanStop {
  stop_id:       string;
  label:         string;
  type:          StopType;
  warehouse_id?: string;
  address:       Address;
  contact_name:  string;
  contact_phone: string;
  pod_required:  boolean;
}

/** Ordered stop IDs — optimization reorders this without mutating stops. */
export interface ExecutionRoute {
  sequence: string[];
}

/** Links order line flow: pickup stop → drop stop. */
export interface ShipmentAllocation {
  allocation_id:   string;
  order_id:        string;
  pickup_stop_id:  string;
  drop_stop_id:    string;
  weight_kg:       number;
  volume_m3:       number;
  description?:    string;
}

export interface MergeOptimizationMetrics {
  merge_score:           number;
  vehicle_utilization_pct: number;
  distance_saved_km:     number;
  carbon_saved_kg:       number;
  savings_inr:           number;
  estimated_profit_inr?: number;
  factors: {
    distance:          number;
    weight:            number;
    volume:            number;
    vehicle_fill:      number;
    delivery_window:   number;
    priority:          number;
    customer_sla:      number;
    revenue:           number;
    profit_margin:     number;
  };
}

export interface ExecutionPlan {
  id:            string;
  plan_number:   string;
  meta?:         EntityMetadata;
  status:        PlanStatus;
  origin:        PlanOrigin;
  stops:         PlanStop[];
  route:         ExecutionRoute;
  allocations:   ShipmentAllocation[];
  constraints:   ExecutionConstraints;
  order_ids:     string[];
  total_orders:  number;
  total_amount:  number;
  total_weight_kg: number;
  total_volume_m3: number;
  optimization?: MergeOptimizationMetrics;
  published_at?: string;
  correlation_id?: string;
  lifecycle_stage?: string;
  journey_in_progress?: boolean;
  created_by:    string;
  created_at:    string;
  updated_at:    string;
  /** Core indent created from this plan (Convert to Indent). */
  indent_id?:    string;
  indent_code?:  string;
  /** Core execution_plans.id when different from the client plan id. */
  core_plan_id?: string;
}

export interface MergeRecommendation {
  id:                      string;
  order_ids:               string[];
  title:                   string;
  savings_inr:             number;
  vehicle_utilization_pct: number;
  distance_saved_km:       number;
  carbon_saved_kg:         number;
  vehicle_suggestion:      string;
  merge_score:             number;
  suggestions:             string[];
}

export interface DashboardStats {
  total_orders:       number;
  pending_orders:     number;
  published_plans:    number;
  fulfilled_today:    number;
  total_revenue:      number;
  avg_order_value:    number;
  orders_this_month:  number;
  revenue_this_month: number;
}

export interface CommerceContextValue {
  tenant:       TenantContext;
  identity:     IdentityContext;
  orders:       Order[];
  plans:        ExecutionPlan[];
  products:     Product[];
  customers:    Customer[];
  warehouses:   Warehouse[];
  stats:        DashboardStats;
  mergeRecommendations: MergeRecommendation[];
  selectedOrderIds: string[];
  setSelectedOrderIds: (ids: string[]) => void;
  toggleOrderSelection: (id: string) => void;
  clearOrderSelection: () => void;
  selectAllPendingOrders: () => void;
  applyMergeRecommendation: (id: string) => void;
  createExecutionPlan: (
    orderIds: string[],
    stops: PlanStop[],
    route: ExecutionRoute,
    allocations: ShipmentAllocation[],
    constraints: ExecutionConstraints,
    optimization?: MergeOptimizationMetrics,
  ) => ExecutionPlan;
  publishExecutionPlan: (
    planId: string,
    planSnapshot?: ExecutionPlan,
    options?: { supplierTargetInr?: number },
  ) => Promise<{ indentId: string; indentCode: string; executionPlanId: string }>;
  sharePlanToOperations: (planId: string) => Promise<void>;
  updateOrderStatus: (orderId: string, status: OrderStatus) => void;
  updateOrder: (orderId: string, patch: Partial<Order>) => void;
  deleteOrder: (orderId: string) => void;
  addOrder: (order: Order) => void;
  refreshOrders: () => Promise<void>;
}
