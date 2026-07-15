-- Initial schema for pulse (local Supabase).
-- Same logical schema as pulse-unified-base; use for local dev or as reference.

-- Generic trigger to set updated_at on row change (only when row actually changes; INSERT uses column default)
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW IS DISTINCT FROM OLD THEN
      NEW.updated_at = now();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Organizations (each user gets one on sign-up; operating_model: asset, aggregate, or both)
CREATE TABLE public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text,
  owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  operating_model text NOT NULL DEFAULT 'HYBRID' CHECK (operating_model IN ('ASSET_BASED', 'NON_ASSET', 'HYBRID')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TRIGGER set_organizations_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Organization members (links users to orgs with role/status)
CREATE TABLE public.organization_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'pending')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(organization_id, user_id)
);

CREATE TRIGGER set_organization_members_updated_at
  BEFORE UPDATE ON public.organization_members
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_organization_members_user_id ON public.organization_members(user_id);
CREATE INDEX idx_organization_members_organization_id ON public.organization_members(organization_id);

-- Organization links: connect two orgs as client or supplier (owner_org "has" linked_org as client/supplier)
CREATE TABLE public.organization_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  linked_org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  link_type text NOT NULL CHECK (link_type IN ('client', 'supplier')),
  created_at timestamptz DEFAULT now(),
  UNIQUE(owner_org_id, linked_org_id, link_type),
  CHECK (owner_org_id != linked_org_id)
);

CREATE INDEX idx_organization_links_owner ON public.organization_links(owner_org_id);
CREATE INDEX idx_organization_links_linked ON public.organization_links(linked_org_id);

-- Helper: true if current user is an active member of the given organization (used by RLS)
CREATE OR REPLACE FUNCTION public.is_org_member(org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = org_id
      AND user_id = auth.uid()
      AND status = 'active'
  );
$$;

REVOKE ALL ON FUNCTION public.is_org_member(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_org_member(uuid) TO authenticated;

-- Per-org counters for tenant-isolated numbering (indent_number, trip_number)
CREATE TABLE public.organization_counters (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  indent_seq bigint NOT NULL DEFAULT 0,
  trip_seq bigint NOT NULL DEFAULT 0
);

CREATE OR REPLACE FUNCTION public.init_organization_counter()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.organization_counters (organization_id)
  VALUES (NEW.id)
  ON CONFLICT (organization_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_organization_created_counter
  AFTER INSERT ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.init_organization_counter();

-- Clients (optional linked_organization_id when this client is another platform org)
CREATE TABLE public.clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  linked_organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  name text NOT NULL,
  contact_person text,
  phone text NOT NULL,
  email text,
  address text,
  gstin text,
  pan_number text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  notes text,
  is_integrated boolean DEFAULT false,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  display_id text,
  UNIQUE(organization_id, phone)
);

CREATE TRIGGER set_clients_updated_at
  BEFORE UPDATE ON public.clients
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_clients_organization_id ON public.clients(organization_id);
CREATE INDEX idx_clients_status ON public.clients(organization_id, status);

-- Suppliers (optional linked_organization_id when this supplier is another platform org)
CREATE TABLE public.suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  linked_organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  name text,
  contact text,
  company_name text,
  contact_person text,
  phone text,
  email text,
  address text,
  gst_number text,
  is_active boolean NOT NULL DEFAULT true,
  is_verified boolean NOT NULL DEFAULT false,
  operating_areas text[] DEFAULT '{}',
  vehicle_types text[] DEFAULT '{}',
  supplier_type text DEFAULT 'offline' CHECK (supplier_type IN ('integrated', 'offline', 'marketplace')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TRIGGER set_suppliers_updated_at
  BEFORE UPDATE ON public.suppliers
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_suppliers_organization_id ON public.suppliers(organization_id);
CREATE UNIQUE INDEX idx_suppliers_org_phone ON public.suppliers(organization_id, phone) WHERE phone IS NOT NULL;

-- Drivers (user_id links to auth.users for driver app “own row” access)
CREATE TABLE public.drivers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  name text NOT NULL,
  phone text,
  email text,
  status text NOT NULL DEFAULT 'offline' CHECK (status IN ('offline', 'online', 'on_trip', 'inactive')),
  assigned_vehicle_id uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(organization_id, phone)
);

CREATE TRIGGER set_drivers_updated_at
  BEFORE UPDATE ON public.drivers
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_drivers_organization_id ON public.drivers(organization_id);
CREATE INDEX idx_drivers_user_id ON public.drivers(user_id);

CREATE INDEX idx_drivers_active ON public.drivers(organization_id) WHERE status IN ('online', 'on_trip');
CREATE INDEX idx_drivers_assigned_vehicle_id ON public.drivers(assigned_vehicle_id);

-- Trigger: on new auth user, create default org + membership + optional driver (bypasses RLS)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  org_id uuid;
  display_name text;
  op_model text;
  usr_role text;
BEGIN
  display_name := coalesce(
    nullif(trim(NEW.raw_user_meta_data->>'full_name'), ''),
    split_part(coalesce(NEW.email, ''), '@', 1),
    'User'
  );
  op_model := coalesce(nullif(trim(NEW.raw_user_meta_data->>'operating_model'), ''), 'HYBRID');
  IF op_model NOT IN ('ASSET_BASED', 'NON_ASSET', 'HYBRID') THEN
    op_model := 'HYBRID';
  END IF;
  usr_role := coalesce(nullif(trim(NEW.raw_user_meta_data->>'role'), ''), 'user');

  INSERT INTO public.organizations (name, owner_id, operating_model)
  VALUES (display_name || '''s organization', NEW.id, op_model)
  RETURNING id INTO org_id;

  INSERT INTO public.organization_members (organization_id, user_id, role, status)
  VALUES (org_id, NEW.id, 'owner', 'active');

  IF usr_role = 'driver' THEN
    INSERT INTO public.drivers (organization_id, user_id, name, phone, email, status)
    VALUES (org_id, NEW.id, display_name, nullif(trim(NEW.raw_user_meta_data->>'phone'), ''), NEW.email, 'offline');
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Vehicles (assigned_vehicle_id FK added after vehicles table)
CREATE TABLE public.vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  vehicle_number text NOT NULL,
  vehicle_type text,
  capacity text,
  vehicle_brand text,
  vehicle_model text,
  vehicle_body_type text,
  vehicle_size text,
  vehicle_axle text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'maintenance')),
  type text NOT NULL DEFAULT 'owned' CHECK (type IN ('owned', 'adhoc')),
  documents jsonb DEFAULT '{}',
  supplier_id uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CHECK (
    (type = 'adhoc' AND supplier_id IS NOT NULL) OR (type = 'owned' AND supplier_id IS NULL)
  )
);

CREATE TRIGGER set_vehicles_updated_at
  BEFORE UPDATE ON public.vehicles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.vehicles
  ADD CONSTRAINT fk_vehicles_supplier
  FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE SET NULL;

ALTER TABLE public.drivers
  ADD CONSTRAINT fk_drivers_assigned_vehicle
  FOREIGN KEY (assigned_vehicle_id) REFERENCES public.vehicles(id) ON DELETE SET NULL;

CREATE INDEX idx_vehicles_organization_id ON public.vehicles(organization_id);
CREATE INDEX idx_vehicles_type ON public.vehicles(organization_id, type);
CREATE INDEX idx_vehicles_supplier_id ON public.vehicles(supplier_id);
CREATE UNIQUE INDEX idx_vehicles_org_number ON public.vehicles(organization_id, vehicle_number);

-- Indents (per-org numbering via organization_counters)
CREATE TABLE public.indents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  indent_number text NOT NULL,
  pickup_area text NOT NULL,
  drop_location text NOT NULL,
  client_name text NOT NULL,
  client_price numeric(12,2) NOT NULL DEFAULT 0,
  supplier_target numeric(12,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'cancelled')),
  vehicle_type text,
  load_type text,
  pickup_date date,
  circulation_target text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(organization_id, indent_number)
);

CREATE TRIGGER set_indents_updated_at
  BEFORE UPDATE ON public.indents
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_indents_organization_id ON public.indents(organization_id);
CREATE INDEX idx_indents_open ON public.indents(organization_id) WHERE status = 'open';

CREATE OR REPLACE FUNCTION public.set_indent_number()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  seq bigint;
BEGIN
  IF NEW.indent_number IS NULL OR NEW.indent_number = '' THEN
    INSERT INTO public.organization_counters (organization_id)
    VALUES (NEW.organization_id)
    ON CONFLICT (organization_id) DO NOTHING;
    UPDATE public.organization_counters
    SET indent_seq = indent_seq + 1
    WHERE organization_id = NEW.organization_id
    RETURNING indent_seq INTO seq;
    NEW.indent_number := 'IND-' || to_char(now(), 'YYYYMMDD') || '-' || lpad(seq::text, 5, '0');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_indent_number_trigger
  BEFORE INSERT ON public.indents
  FOR EACH ROW
  EXECUTE FUNCTION public.set_indent_number();

-- Trips (per-org numbering; margin generated from client_price - supplier_rate)
CREATE TABLE public.trips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  trip_number text NOT NULL,
  indent_id uuid REFERENCES public.indents(id) ON DELETE SET NULL,
  source text NOT NULL DEFAULT 'manual',
  pickup_area text NOT NULL,
  drop_location text NOT NULL,
  distance numeric(10,2),
  estimated_duration interval,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  client_name text NOT NULL,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  driver_id uuid REFERENCES public.drivers(id) ON DELETE SET NULL,
  vehicle_id uuid REFERENCES public.vehicles(id) ON DELETE SET NULL,
  client_price numeric(12,2) NOT NULL DEFAULT 0,
  supplier_rate numeric(12,2) NOT NULL DEFAULT 0,
  margin numeric(12,2) GENERATED ALWAYS AS (client_price - supplier_rate) STORED,
  platform_fee numeric(12,2) NOT NULL DEFAULT 0,
  driver_commission numeric(12,2) NOT NULL DEFAULT 0,
  is_guaranteed boolean NOT NULL DEFAULT false,
  payment_status text NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'partial', 'cancelled')),
  amount_paid numeric(12,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'assigned' CHECK (status IN ('draft', 'assigned', 'in_progress', 'completed', 'cancelled')),
  pickup_date date,
  started_at timestamptz,
  completed_at timestamptz,
  load_type text,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(organization_id, trip_number),
  CHECK (amount_paid <= client_price),
  CHECK (
    (status = 'completed' AND completed_at IS NOT NULL) OR (status <> 'completed' AND completed_at IS NULL)
  )
);

CREATE TRIGGER set_trips_updated_at
  BEFORE UPDATE ON public.trips
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_trips_organization_id ON public.trips(organization_id);
CREATE INDEX idx_trips_driver_id ON public.trips(driver_id);
CREATE INDEX idx_trips_status ON public.trips(organization_id, status);
CREATE INDEX idx_trips_indent_id ON public.trips(indent_id);
CREATE INDEX idx_trips_client_id ON public.trips(client_id);
CREATE INDEX idx_trips_supplier_id ON public.trips(supplier_id);
CREATE INDEX idx_trips_active ON public.trips(organization_id) WHERE status IN ('assigned', 'in_progress');

CREATE OR REPLACE FUNCTION public.set_trip_number()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  seq bigint;
BEGIN
  IF NEW.trip_number IS NULL OR NEW.trip_number = '' THEN
    INSERT INTO public.organization_counters (organization_id)
    VALUES (NEW.organization_id)
    ON CONFLICT (organization_id) DO NOTHING;
    UPDATE public.organization_counters
    SET trip_seq = trip_seq + 1
    WHERE organization_id = NEW.organization_id
    RETURNING trip_seq INTO seq;
    NEW.trip_number := 'TRP-' || to_char(now(), 'YYYYMMDD') || '-' || lpad(seq::text, 5, '0');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_trip_number_trigger
  BEFORE INSERT ON public.trips
  FOR EACH ROW
  EXECUTE FUNCTION public.set_trip_number();

-- Transactions (ledger; double-entry: exactly one of amount_in or amount_out non-zero)
CREATE TABLE public.transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  trip_id uuid REFERENCES public.trips(id) ON DELETE SET NULL,
  party_name text NOT NULL,
  description text NOT NULL DEFAULT '',
  amount_in numeric(12,2) NOT NULL DEFAULT 0,
  amount_out numeric(12,2) NOT NULL DEFAULT 0,
  transaction_date date NOT NULL DEFAULT current_date,
  created_at timestamptz DEFAULT now(),
  CHECK (
    (amount_in > 0 AND amount_out = 0) OR (amount_out > 0 AND amount_in = 0)
  )
);

CREATE INDEX idx_transactions_organization_id ON public.transactions(organization_id);
CREATE INDEX idx_transactions_trip_id ON public.transactions(trip_id);
CREATE INDEX idx_transactions_transaction_date ON public.transactions(organization_id, transaction_date DESC);

-- RLS: organization_members
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own memberships"
  ON public.organization_members FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can add own membership"
  ON public.organization_members FOR INSERT
  WITH CHECK (user_id = auth.uid());

GRANT SELECT, INSERT ON public.organization_members TO authenticated;

-- RLS: organizations
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read orgs they belong to"
  ON public.organizations FOR SELECT
  USING (public.is_org_member(id));

CREATE POLICY "Users can create organization they own"
  ON public.organizations FOR INSERT
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Users can update organization they own"
  ON public.organizations FOR UPDATE
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

GRANT SELECT, INSERT, UPDATE ON public.organizations TO authenticated;

-- RLS: organization_links (owner org manages; linked org can read to see connections)
ALTER TABLE public.organization_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can manage their org links"
  ON public.organization_links FOR ALL
  USING (public.is_org_member(owner_org_id))
  WITH CHECK (public.is_org_member(owner_org_id));

CREATE POLICY "Linked org members can read links where they are linked"
  ON public.organization_links FOR SELECT
  USING (public.is_org_member(linked_org_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.organization_links TO authenticated;

-- RLS: clients
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can manage clients"
  ON public.clients FOR ALL
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.clients TO authenticated;

-- RLS: suppliers
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can manage suppliers"
  ON public.suppliers FOR ALL
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.suppliers TO authenticated;

-- RLS: drivers (org members manage; drivers can read own row)
ALTER TABLE public.drivers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can manage drivers"
  ON public.drivers FOR ALL
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));

CREATE POLICY "Drivers can read own row"
  ON public.drivers FOR SELECT
  USING (user_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.drivers TO authenticated;

-- RLS: vehicles
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can manage vehicles"
  ON public.vehicles FOR ALL
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vehicles TO authenticated;

-- RLS: indents
ALTER TABLE public.indents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can manage indents"
  ON public.indents FOR ALL
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.indents TO authenticated;

-- RLS: trips
ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can manage trips"
  ON public.trips FOR ALL
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));

CREATE POLICY "Drivers can read own trips"
  ON public.trips FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.drivers d
      WHERE d.id = trips.driver_id AND d.user_id = auth.uid()
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.trips TO authenticated;

-- RLS: transactions
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can manage transactions"
  ON public.transactions FOR ALL
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.transactions TO authenticated;

COMMENT ON TABLE public.organizations IS 'Tenant organizations; operating_model: ASSET_BASED, NON_ASSET (aggregate), or HYBRID (both)';
COMMENT ON COLUMN public.organizations.operating_model IS 'Business model chosen at sign-up: asset-based, aggregate (non-asset), or both (hybrid)';
COMMENT ON TABLE public.organization_links IS 'Org-to-org connections: owner_org has linked_org as client (supplies to) or supplier (buys from)';
COMMENT ON TABLE public.organization_members IS 'User-org membership; RLS restricts to own rows for SELECT';
COMMENT ON COLUMN public.clients.linked_organization_id IS 'When set, this client is another platform org; use organization_links for two-way connection';
COMMENT ON COLUMN public.suppliers.linked_organization_id IS 'When set, this supplier is another platform org; use organization_links for two-way connection';
COMMENT ON FUNCTION public.is_org_member(uuid) IS 'True if current user is active member of org_id; used by RLS';
