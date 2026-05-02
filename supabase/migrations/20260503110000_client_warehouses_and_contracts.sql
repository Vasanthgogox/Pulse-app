-- Add billing/HQ address fields to clients
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS hq_address text,
  ADD COLUMN IF NOT EXISTS billing_address text;

-- Client warehouses (pickup/distribution hubs)
CREATE TABLE IF NOT EXISTS public.client_warehouses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  name text NOT NULL,
  address text,
  city text,
  state text,
  local_gstin text,
  contact_name text,
  contact_phone text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_client_warehouses_client ON public.client_warehouses(client_id);
CREATE INDEX IF NOT EXISTS idx_client_warehouses_org ON public.client_warehouses(organization_id);
ALTER TABLE public.client_warehouses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members manage warehouses"
  ON public.client_warehouses FOR ALL
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_warehouses TO authenticated;

-- Client route contracts (lane + rate)
CREATE TABLE IF NOT EXISTS public.client_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  warehouse_id uuid REFERENCES public.client_warehouses(id) ON DELETE SET NULL,
  pickup_area text NOT NULL,
  drop_location text NOT NULL,
  rate numeric(14,2),
  rate_type text DEFAULT 'per_trip' CHECK (rate_type IN ('per_trip','per_ton','per_kg','per_km','fixed')),
  billing_to_hq boolean DEFAULT true,
  valid_from date,
  valid_to date,
  notes text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_client_contracts_client ON public.client_contracts(client_id);
CREATE INDEX IF NOT EXISTS idx_client_contracts_org ON public.client_contracts(organization_id);
ALTER TABLE public.client_contracts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members manage contracts"
  ON public.client_contracts FOR ALL
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_contracts TO authenticated;
