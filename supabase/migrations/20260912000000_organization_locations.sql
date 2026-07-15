-- Workspace hubs / offices shown on Network desktop Details tab.

CREATE TABLE IF NOT EXISTS public.organization_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  location_type text NOT NULL DEFAULT 'other'
    CHECK (location_type IN ('primary_hub', 'regional_office', 'dispatch_center', 'other')),
  department text DEFAULT 'Operations & dispatch',
  address_line text,
  city text,
  state text,
  is_verified boolean NOT NULL DEFAULT false,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_organization_locations_org
  ON public.organization_locations(organization_id, sort_order);

ALTER TABLE public.organization_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members manage organization locations"
  ON public.organization_locations FOR ALL
  TO authenticated
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.organization_locations TO authenticated;
