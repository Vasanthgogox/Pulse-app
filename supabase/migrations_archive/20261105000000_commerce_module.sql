-- Commerce Module — canonical bounded context inside Pulse Platform
-- Reuses: organizations, clients (Customer), client_warehouses (Warehouse/CustomerAddress), organization_locations (Branch)
-- Creates: commerce_products, commerce_inventory, sales_orders, sales_order_lines,
--          execution_plans, execution_plan_stops, shipment_allocations

-- ─────────────────────────────────────────────
-- SEQUENCE COUNTERS
-- ─────────────────────────────────────────────
ALTER TABLE public.organization_counters
  ADD COLUMN IF NOT EXISTS plan_seq  bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS order_seq bigint NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.next_plan_number(p_org_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_seq  bigint;
  v_year text := to_char(now(), 'YYYY');
BEGIN
  UPDATE public.organization_counters
  SET plan_seq = plan_seq + 1
  WHERE organization_id = p_org_id
  RETURNING plan_seq INTO v_seq;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Org counter missing for: %', p_org_id;
  END IF;
  RETURN 'EP-' || v_year || '-' || LPAD(v_seq::text, 4, '0');
END;
$$;
GRANT EXECUTE ON FUNCTION public.next_plan_number(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.next_order_number(p_org_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_seq  bigint;
  v_year text := to_char(now(), 'YYYY');
BEGIN
  UPDATE public.organization_counters
  SET order_seq = order_seq + 1
  WHERE organization_id = p_org_id
  RETURNING order_seq INTO v_seq;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Org counter missing for: %', p_org_id;
  END IF;
  RETURN 'SO-' || v_year || '-' || LPAD(v_seq::text, 5, '0');
END;
$$;
GRANT EXECUTE ON FUNCTION public.next_order_number(uuid) TO authenticated;

-- ─────────────────────────────────────────────
-- COMMERCE PRODUCTS
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.commerce_products (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  sku             text NOT NULL,
  name            text NOT NULL,
  description     text,
  category        text NOT NULL DEFAULT 'FMCG'
                    CHECK (category IN ('Electronics','Apparel','FMCG','Industrial','Pharmaceuticals','Food & Beverage')),
  uom             text NOT NULL DEFAULT 'unit',
  unit_price      numeric(12,2) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  weight_kg       numeric(8,3)  NOT NULL DEFAULT 0 CHECK (weight_kg >= 0),
  volume_m3       numeric(8,4)  NOT NULL DEFAULT 0 CHECK (volume_m3 >= 0),
  length_cm       numeric(8,2),
  width_cm        numeric(8,2),
  height_cm       numeric(8,2),
  hazmat          boolean NOT NULL DEFAULT false,
  fragile         boolean NOT NULL DEFAULT false,
  temperature_type text NOT NULL DEFAULT 'ambient'
                    CHECK (temperature_type IN ('ambient','cold_chain','frozen')),
  status          text NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active','inactive','discontinued')),
  hsn_code        text,
  tax_rate        numeric(5,2) NOT NULL DEFAULT 18.0,
  created_by      uuid REFERENCES auth.users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz,
  CONSTRAINT uq_product_sku_per_org UNIQUE (organization_id, sku)
);

CREATE INDEX IF NOT EXISTS idx_commerce_products_org
  ON public.commerce_products(organization_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_commerce_products_status
  ON public.commerce_products(organization_id, status) WHERE deleted_at IS NULL;

ALTER TABLE public.commerce_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "commerce_products_select" ON public.commerce_products
  FOR SELECT USING (public.is_org_member(organization_id));
CREATE POLICY "commerce_products_insert" ON public.commerce_products
  FOR INSERT WITH CHECK (public.is_org_member(organization_id));
CREATE POLICY "commerce_products_update" ON public.commerce_products
  FOR UPDATE USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));
CREATE POLICY "commerce_products_delete" ON public.commerce_products
  FOR DELETE USING (public.is_org_admin(organization_id));

-- ─────────────────────────────────────────────
-- COMMERCE INVENTORY
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.commerce_inventory (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  product_id      uuid NOT NULL REFERENCES public.commerce_products(id) ON DELETE CASCADE,
  warehouse_id    uuid NOT NULL REFERENCES public.client_warehouses(id) ON DELETE CASCADE,
  available_qty   numeric(12,3) NOT NULL DEFAULT 0 CHECK (available_qty >= 0),
  reserved_qty    numeric(12,3) NOT NULL DEFAULT 0 CHECK (reserved_qty >= 0),
  damaged_qty     numeric(12,3) NOT NULL DEFAULT 0 CHECK (damaged_qty >= 0),
  reorder_level   numeric(12,3) NOT NULL DEFAULT 0 CHECK (reorder_level >= 0),
  last_adjusted_at timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_inventory_product_warehouse UNIQUE (product_id, warehouse_id)
);

CREATE INDEX IF NOT EXISTS idx_commerce_inventory_org
  ON public.commerce_inventory(organization_id);
CREATE INDEX IF NOT EXISTS idx_commerce_inventory_warehouse
  ON public.commerce_inventory(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_commerce_inventory_product
  ON public.commerce_inventory(product_id);

ALTER TABLE public.commerce_inventory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "commerce_inventory_select" ON public.commerce_inventory
  FOR SELECT USING (public.is_org_member(organization_id));
CREATE POLICY "commerce_inventory_insert" ON public.commerce_inventory
  FOR INSERT WITH CHECK (public.is_org_member(organization_id));
CREATE POLICY "commerce_inventory_update" ON public.commerce_inventory
  FOR UPDATE USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));
CREATE POLICY "commerce_inventory_delete" ON public.commerce_inventory
  FOR DELETE USING (public.is_org_admin(organization_id));

-- ─────────────────────────────────────────────
-- EXECUTION PLANS  (created before sales_orders so sales_orders can FK to it)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.execution_plans (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_number     text NOT NULL,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  status          text NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','optimizing','ready','published','fulfilled','cancelled')),
  origin          text NOT NULL DEFAULT 'customer_orders'
                    CHECK (origin IN ('customer_orders','purchase_order','warehouse_transfer',
                                      'store_replenishment','returns','cross_dock')),
  merge_score       numeric(5,2),
  planned_vehicle_type text,
  constraints       jsonb NOT NULL DEFAULT '{}',
  correlation_id    text,
  lifecycle_stage   text,
  published_at      timestamptz,
  created_by        uuid REFERENCES auth.users(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  deleted_at        timestamptz,
  CONSTRAINT uq_plan_number_per_org UNIQUE (organization_id, plan_number)
);

CREATE INDEX IF NOT EXISTS idx_execution_plans_org
  ON public.execution_plans(organization_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_execution_plans_status
  ON public.execution_plans(organization_id, status) WHERE deleted_at IS NULL;

ALTER TABLE public.execution_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "execution_plans_select" ON public.execution_plans
  FOR SELECT USING (public.is_org_member(organization_id));
CREATE POLICY "execution_plans_insert" ON public.execution_plans
  FOR INSERT WITH CHECK (public.is_org_member(organization_id));
CREATE POLICY "execution_plans_update" ON public.execution_plans
  FOR UPDATE USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));
CREATE POLICY "execution_plans_delete" ON public.execution_plans
  FOR DELETE USING (public.is_org_admin(organization_id));

-- ─────────────────────────────────────────────
-- SALES ORDERS
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sales_orders (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number          text NOT NULL,
  organization_id       uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  customer_id           uuid NOT NULL REFERENCES public.clients(id),
  pickup_warehouse_id   uuid NOT NULL REFERENCES public.client_warehouses(id),
  drop_warehouse_id     uuid REFERENCES public.client_warehouses(id),
  status                text NOT NULL DEFAULT 'Draft'
                          CHECK (status IN ('Draft','Pending Consolidation','Planned','Fulfilled','Cancelled')),
  priority              text NOT NULL DEFAULT 'standard'
                          CHECK (priority IN ('standard','express','critical')),
  source                text NOT NULL DEFAULT 'Manual'
                          CHECK (source IN ('Manual','Shopify','WooCommerce','API')),
  delivery_window_start timestamptz,
  delivery_window_end   timestamptz,
  expected_dispatch_date date,
  currency              text NOT NULL DEFAULT 'INR',
  subtotal              numeric(12,2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  tax_amount            numeric(12,2) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
  total_amount          numeric(12,2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  total_weight_kg       numeric(10,3) NOT NULL DEFAULT 0 CHECK (total_weight_kg >= 0),
  total_volume_m3       numeric(10,4) NOT NULL DEFAULT 0 CHECK (total_volume_m3 >= 0),
  notes                 text,
  execution_plan_id     uuid REFERENCES public.execution_plans(id),
  created_by            uuid REFERENCES auth.users(id),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  deleted_at            timestamptz,
  CONSTRAINT uq_order_number_per_org UNIQUE (organization_id, order_number)
);

CREATE INDEX IF NOT EXISTS idx_sales_orders_org
  ON public.sales_orders(organization_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_sales_orders_status
  ON public.sales_orders(organization_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_sales_orders_customer
  ON public.sales_orders(customer_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_sales_orders_plan
  ON public.sales_orders(execution_plan_id) WHERE execution_plan_id IS NOT NULL;

ALTER TABLE public.sales_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sales_orders_select" ON public.sales_orders
  FOR SELECT USING (public.is_org_member(organization_id));
CREATE POLICY "sales_orders_insert" ON public.sales_orders
  FOR INSERT WITH CHECK (public.is_org_member(organization_id));
CREATE POLICY "sales_orders_update" ON public.sales_orders
  FOR UPDATE USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));
CREATE POLICY "sales_orders_delete" ON public.sales_orders
  FOR DELETE USING (public.is_org_admin(organization_id));

-- ─────────────────────────────────────────────
-- SALES ORDER LINES
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sales_order_lines (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  sales_order_id    uuid NOT NULL REFERENCES public.sales_orders(id) ON DELETE CASCADE,
  product_id        uuid NOT NULL REFERENCES public.commerce_products(id),
  quantity          numeric(12,3) NOT NULL CHECK (quantity > 0),
  allocated_quantity numeric(12,3) NOT NULL DEFAULT 0 CHECK (allocated_quantity >= 0),
  unit_price        numeric(12,2) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  tax_rate          numeric(5,2)  NOT NULL DEFAULT 0  CHECK (tax_rate >= 0),
  line_total        numeric(12,2) NOT NULL DEFAULT 0,
  weight_kg         numeric(10,3) NOT NULL DEFAULT 0 CHECK (weight_kg >= 0),
  volume_m3         numeric(10,4) NOT NULL DEFAULT 0 CHECK (volume_m3 >= 0),
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sales_order_lines_order
  ON public.sales_order_lines(sales_order_id);
CREATE INDEX IF NOT EXISTS idx_sales_order_lines_product
  ON public.sales_order_lines(product_id);
CREATE INDEX IF NOT EXISTS idx_sales_order_lines_org
  ON public.sales_order_lines(organization_id);

ALTER TABLE public.sales_order_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sales_order_lines_select" ON public.sales_order_lines
  FOR SELECT USING (public.is_org_member(organization_id));
CREATE POLICY "sales_order_lines_insert" ON public.sales_order_lines
  FOR INSERT WITH CHECK (public.is_org_member(organization_id));
CREATE POLICY "sales_order_lines_update" ON public.sales_order_lines
  FOR UPDATE USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));
CREATE POLICY "sales_order_lines_delete" ON public.sales_order_lines
  FOR DELETE USING (public.is_org_admin(organization_id));

-- ─────────────────────────────────────────────
-- EXECUTION PLAN STOPS
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.execution_plan_stops (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  execution_plan_id   uuid NOT NULL REFERENCES public.execution_plans(id) ON DELETE CASCADE,
  stop_type           text NOT NULL CHECK (stop_type IN ('pickup','drop')),
  warehouse_id        uuid NOT NULL REFERENCES public.client_warehouses(id),
  sequence            int  NOT NULL DEFAULT 0,
  label               text,
  contact_name        text,
  contact_phone       text,
  pod_required        boolean NOT NULL DEFAULT false,
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ep_stops_plan
  ON public.execution_plan_stops(execution_plan_id);
CREATE INDEX IF NOT EXISTS idx_ep_stops_org
  ON public.execution_plan_stops(organization_id);

ALTER TABLE public.execution_plan_stops ENABLE ROW LEVEL SECURITY;

CREATE POLICY "execution_plan_stops_select" ON public.execution_plan_stops
  FOR SELECT USING (public.is_org_member(organization_id));
CREATE POLICY "execution_plan_stops_insert" ON public.execution_plan_stops
  FOR INSERT WITH CHECK (public.is_org_member(organization_id));
CREATE POLICY "execution_plan_stops_update" ON public.execution_plan_stops
  FOR UPDATE USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));
CREATE POLICY "execution_plan_stops_delete" ON public.execution_plan_stops
  FOR DELETE USING (public.is_org_admin(organization_id));

-- ─────────────────────────────────────────────
-- SHIPMENT ALLOCATIONS
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.shipment_allocations (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  execution_plan_id    uuid NOT NULL REFERENCES public.execution_plans(id) ON DELETE CASCADE,
  sales_order_line_id  uuid NOT NULL REFERENCES public.sales_order_lines(id) ON DELETE CASCADE,
  pickup_stop_id       uuid NOT NULL REFERENCES public.execution_plan_stops(id),
  drop_stop_id         uuid NOT NULL REFERENCES public.execution_plan_stops(id),
  quantity             numeric(12,3) NOT NULL CHECK (quantity > 0),
  weight_kg            numeric(10,3) NOT NULL DEFAULT 0,
  volume_m3            numeric(10,4) NOT NULL DEFAULT 0,
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shipment_alloc_plan
  ON public.shipment_allocations(execution_plan_id);
CREATE INDEX IF NOT EXISTS idx_shipment_alloc_line
  ON public.shipment_allocations(sales_order_line_id);
CREATE INDEX IF NOT EXISTS idx_shipment_alloc_org
  ON public.shipment_allocations(organization_id);

ALTER TABLE public.shipment_allocations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "shipment_allocations_select" ON public.shipment_allocations
  FOR SELECT USING (public.is_org_member(organization_id));
CREATE POLICY "shipment_allocations_insert" ON public.shipment_allocations
  FOR INSERT WITH CHECK (public.is_org_member(organization_id));
CREATE POLICY "shipment_allocations_update" ON public.shipment_allocations
  FOR UPDATE USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));
CREATE POLICY "shipment_allocations_delete" ON public.shipment_allocations
  FOR DELETE USING (public.is_org_admin(organization_id));

-- ─────────────────────────────────────────────
-- updated_at TRIGGERS
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$$;

DO $$ BEGIN
  CREATE TRIGGER trg_commerce_products_updated_at
    BEFORE UPDATE ON public.commerce_products
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

DO $$ BEGIN
  CREATE TRIGGER trg_commerce_inventory_updated_at
    BEFORE UPDATE ON public.commerce_inventory
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

DO $$ BEGIN
  CREATE TRIGGER trg_sales_orders_updated_at
    BEFORE UPDATE ON public.sales_orders
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

DO $$ BEGIN
  CREATE TRIGGER trg_execution_plans_updated_at
    BEFORE UPDATE ON public.execution_plans
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;
