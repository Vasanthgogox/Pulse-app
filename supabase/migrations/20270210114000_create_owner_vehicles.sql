-- Phase 1b: personal Fleet Owner vehicles (owner_user_id, not organization_id).
-- Business public.vehicles remains org-owned and unchanged.
-- See docs/DRIVER_FLEET_OWNER_PHASE1.md
-- Future trips may reference owner_vehicles.id via an explicit column (e.g. owner_vehicle_id);
-- ownership never implies Business create-trip capability.

CREATE TABLE IF NOT EXISTS public.owner_vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  vehicle_number text NOT NULL,
  vehicle_type text,
  capacity text,
  vehicle_brand text,
  vehicle_model text,
  vehicle_body_type text,
  vehicle_size text,
  vehicle_axle text,
  fuel_type text,
  status text NOT NULL DEFAULT 'active'
    CHECK (status = ANY (ARRAY['active'::text, 'inactive'::text, 'maintenance'::text])),
  documents jsonb NOT NULL DEFAULT '{}'::jsonb,
  avatar_url text,
  avatar_seed text,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT owner_vehicles_number_nonempty CHECK (length(trim(vehicle_number)) > 0)
);

COMMENT ON TABLE public.owner_vehicles IS
  'Driver App Fleet Owner personal vehicles. Owned by user_id, not an organization. Distinct from public.vehicles.';

COMMENT ON COLUMN public.owner_vehicles.documents IS
  'Deprecated for Phase 2+ operational docs — use owner_vehicle_documents rows. Kept for compatibility.';

ALTER TABLE public.owner_vehicles OWNER TO postgres;

CREATE UNIQUE INDEX IF NOT EXISTS idx_owner_vehicles_owner_number_active
  ON public.owner_vehicles (owner_user_id, upper(replace(vehicle_number, ' ', '')))
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_owner_vehicles_owner_user_id
  ON public.owner_vehicles (owner_user_id)
  WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS set_owner_vehicles_updated_at ON public.owner_vehicles;
CREATE TRIGGER set_owner_vehicles_updated_at
  BEFORE UPDATE ON public.owner_vehicles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.owner_vehicles ENABLE ROW LEVEL SECURITY;

-- Owner-only access; must also be a Fleet Owner.
DROP POLICY IF EXISTS "Fleet owners manage own vehicles"
  ON public.owner_vehicles;
CREATE POLICY "Fleet owners manage own vehicles"
  ON public.owner_vehicles
  FOR ALL
  TO authenticated
  USING (
    owner_user_id = (SELECT auth.uid())
    AND public.is_driver_fleet_owner((SELECT auth.uid()))
  )
  WITH CHECK (
    owner_user_id = (SELECT auth.uid())
    AND public.is_driver_fleet_owner((SELECT auth.uid()))
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.owner_vehicles TO authenticated;
GRANT ALL ON public.owner_vehicles TO service_role;
-- Phase 1b: personal Fleet Owner vehicles (owner_user_id, not organization_id).
-- Business public.vehicles remains org-owned and unchanged.
-- See docs/DRIVER_FLEET_OWNER_PHASE1.md
-- Future trips may reference owner_vehicles.id via an explicit column (e.g. owner_vehicle_id);
-- ownership never implies Business create-trip capability.

CREATE TABLE IF NOT EXISTS public.owner_vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  vehicle_number text NOT NULL,
  vehicle_type text,
  capacity text,
  vehicle_brand text,
  vehicle_model text,
  vehicle_body_type text,
  vehicle_size text,
  vehicle_axle text,
  fuel_type text,
  status text NOT NULL DEFAULT 'active'
    CHECK (status = ANY (ARRAY['active'::text, 'inactive'::text, 'maintenance'::text])),
  documents jsonb NOT NULL DEFAULT '{}'::jsonb,
  avatar_url text,
  avatar_seed text,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT owner_vehicles_number_nonempty CHECK (length(trim(vehicle_number)) > 0)
);

COMMENT ON TABLE public.owner_vehicles IS
  'Driver App Fleet Owner personal vehicles. Owned by user_id, not an organization. Distinct from public.vehicles.';

COMMENT ON COLUMN public.owner_vehicles.documents IS
  'Document vault JSON (Phase 2). Shape aligned with Business vehicle documents helpers.';

ALTER TABLE public.owner_vehicles OWNER TO postgres;

CREATE UNIQUE INDEX IF NOT EXISTS idx_owner_vehicles_owner_number_active
  ON public.owner_vehicles (owner_user_id, upper(replace(vehicle_number, ' ', '')))
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_owner_vehicles_owner_user_id
  ON public.owner_vehicles (owner_user_id)
  WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS set_owner_vehicles_updated_at ON public.owner_vehicles;
CREATE TRIGGER set_owner_vehicles_updated_at
  BEFORE UPDATE ON public.owner_vehicles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.owner_vehicles ENABLE ROW LEVEL SECURITY;

-- Owner-only access; must also be a Fleet Owner.
DROP POLICY IF EXISTS "Fleet owners manage own vehicles"
  ON public.owner_vehicles;
CREATE POLICY "Fleet owners manage own vehicles"
  ON public.owner_vehicles
  FOR ALL
  TO authenticated
  USING (
    owner_user_id = (SELECT auth.uid())
    AND public.is_driver_fleet_owner((SELECT auth.uid()))
  )
  WITH CHECK (
    owner_user_id = (SELECT auth.uid())
    AND public.is_driver_fleet_owner((SELECT auth.uid()))
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.owner_vehicles TO authenticated;
GRANT ALL ON public.owner_vehicles TO service_role;
