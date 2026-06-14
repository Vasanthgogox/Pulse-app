-- ============================================================
-- Supplier Management Module
-- Mirrors the client management module pattern.
-- Adds 6 sub-entity tables + extends suppliers + RPC bundle.
-- ============================================================

-- ── Extend suppliers table ──────────────────────────────────

ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS gstin text,
  ADD COLUMN IF NOT EXISTS pan_number text,
  ADD COLUMN IF NOT EXISTS registered_address text,
  ADD COLUMN IF NOT EXISTS website text,
  ADD COLUMN IF NOT EXISTS industry text,
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES auth.users(id);

-- ── supplier_contacts ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.supplier_contacts (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  supplier_id      uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  name             text NOT NULL,
  designation      text,
  mobile           text,
  email            text,
  department       text,
  is_primary       boolean NOT NULL DEFAULT false,
  is_operations    boolean NOT NULL DEFAULT false,
  is_finance       boolean NOT NULL DEFAULT false,
  is_dispatch      boolean NOT NULL DEFAULT false,
  notes            text,
  created_by       uuid REFERENCES auth.users(id),
  updated_by       uuid REFERENCES auth.users(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  deleted_at       timestamptz
);

ALTER TABLE public.supplier_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members manage supplier contacts"
  ON public.supplier_contacts FOR ALL
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));

-- ── supplier_kyc_documents ──────────────────────────────────

CREATE TABLE IF NOT EXISTS public.supplier_kyc_documents (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  supplier_id      uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  doc_type         text NOT NULL CHECK (doc_type IN (
                     'pan','gstin','cin','partnership_deed',
                     'certificate_of_incorporation','board_resolution',
                     'aadhaar_front','aadhaar_back','msme','other')),
  doc_label        text,
  storage_path     text,
  file_name        text,
  mime_type        text,
  expiry_date      date,
  version_number   int NOT NULL DEFAULT 1,
  is_mandatory     boolean NOT NULL DEFAULT false,
  status           text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','verified','rejected','expired')),
  verified_at      timestamptz,
  verified_by      uuid REFERENCES auth.users(id),
  notes            text,
  created_by       uuid REFERENCES auth.users(id),
  updated_by       uuid REFERENCES auth.users(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  deleted_at       timestamptz
);

ALTER TABLE public.supplier_kyc_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members manage supplier kyc documents"
  ON public.supplier_kyc_documents FOR ALL
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));

-- ── supplier_compliance_documents ──────────────────────────

CREATE TABLE IF NOT EXISTS public.supplier_compliance_documents (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  supplier_id      uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  doc_type         text NOT NULL CHECK (doc_type IN (
                     'insurance','pollution_certificate','gst',
                     'labor_license','vehicle_fitness','trade_license','other')),
  label            text NOT NULL,
  storage_path     text,
  file_name        text,
  expiry_date      date,
  status           text NOT NULL DEFAULT 'amber' CHECK (status IN ('green','amber','red')),
  notes            text,
  created_by       uuid REFERENCES auth.users(id),
  updated_by       uuid REFERENCES auth.users(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  deleted_at       timestamptz
);

ALTER TABLE public.supplier_compliance_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members manage supplier compliance documents"
  ON public.supplier_compliance_documents FOR ALL
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));

-- ── supplier_contract_agreements ───────────────────────────

CREATE TABLE IF NOT EXISTS public.supplier_contract_agreements (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  supplier_id      uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  contract_number  text NOT NULL,
  title            text,
  status           text NOT NULL DEFAULT 'draft' CHECK (status IN (
                     'draft','active','expired','terminated','renewal_pending')),
  rate_type        text CHECK (rate_type IN (
                     'per_trip','per_ton','per_km','per_vehicle_type','fixed_monthly')),
  effective_date   date,
  expiry_date      date,
  payment_terms    jsonb,
  sla_terms        jsonb,
  general_terms    text,
  signed_storage_path text,
  notes            text,
  created_by       uuid REFERENCES auth.users(id),
  updated_by       uuid REFERENCES auth.users(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  deleted_at       timestamptz
);

ALTER TABLE public.supplier_contract_agreements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members manage supplier contract agreements"
  ON public.supplier_contract_agreements FOR ALL
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));

-- ── supplier_fleet ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.supplier_fleet (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  supplier_id      uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  vehicle_number   text NOT NULL,
  vehicle_type     text,
  capacity_tons    numeric,
  ownership        text NOT NULL DEFAULT 'owned' CHECK (ownership IN ('owned','leased','hired')),
  insurance_expiry date,
  fitness_expiry   date,
  permit_expiry    date,
  has_gps          boolean NOT NULL DEFAULT false,
  driver_id        uuid REFERENCES public.drivers(id) ON DELETE SET NULL,
  notes            text,
  created_by       uuid REFERENCES auth.users(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  deleted_at       timestamptz
);

ALTER TABLE public.supplier_fleet ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members manage supplier fleet"
  ON public.supplier_fleet FOR ALL
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));

-- ── supplier_warehouses ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.supplier_warehouses (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  supplier_id           uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  name                  text NOT NULL,
  address               text,
  city                  text,
  state                 text,
  pincode               text,
  contact_name          text,
  contact_phone         text,
  storage_capacity_tons numeric,
  loading_bays          int,
  notes                 text,
  created_by            uuid REFERENCES auth.users(id),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  deleted_at            timestamptz
);

ALTER TABLE public.supplier_warehouses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members manage supplier warehouses"
  ON public.supplier_warehouses FOR ALL
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));

-- ── updated_at triggers ─────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DO $$ BEGIN
  CREATE TRIGGER trg_supplier_contacts_updated_at
    BEFORE UPDATE ON public.supplier_contacts
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_supplier_kyc_documents_updated_at
    BEFORE UPDATE ON public.supplier_kyc_documents
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_supplier_compliance_docs_updated_at
    BEFORE UPDATE ON public.supplier_compliance_documents
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_supplier_contract_agreements_updated_at
    BEFORE UPDATE ON public.supplier_contract_agreements
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_supplier_fleet_updated_at
    BEFORE UPDATE ON public.supplier_fleet
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_supplier_warehouses_updated_at
    BEFORE UPDATE ON public.supplier_warehouses
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── get_supplier_management_bundle RPC ─────────────────────

CREATE OR REPLACE FUNCTION public.get_supplier_management_bundle(
  p_org_id      uuid,
  p_supplier_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'supplier',        row_to_json(s.*),
    'contacts',        COALESCE(
                         (SELECT jsonb_agg(c ORDER BY c.created_at)
                          FROM supplier_contacts c
                          WHERE c.supplier_id = p_supplier_id
                            AND c.organization_id = p_org_id
                            AND c.deleted_at IS NULL),
                         '[]'::jsonb),
    'kyc_documents',   COALESCE(
                         (SELECT jsonb_agg(k ORDER BY k.created_at)
                          FROM supplier_kyc_documents k
                          WHERE k.supplier_id = p_supplier_id
                            AND k.organization_id = p_org_id
                            AND k.deleted_at IS NULL),
                         '[]'::jsonb),
    'compliance_docs', COALESCE(
                         (SELECT jsonb_agg(d ORDER BY d.expiry_date NULLS LAST)
                          FROM supplier_compliance_documents d
                          WHERE d.supplier_id = p_supplier_id
                            AND d.organization_id = p_org_id
                            AND d.deleted_at IS NULL),
                         '[]'::jsonb),
    'contracts',       COALESCE(
                         (SELECT jsonb_agg(ct ORDER BY ct.created_at DESC)
                          FROM supplier_contract_agreements ct
                          WHERE ct.supplier_id = p_supplier_id
                            AND ct.organization_id = p_org_id
                            AND ct.deleted_at IS NULL),
                         '[]'::jsonb),
    'fleet',           COALESCE(
                         (SELECT jsonb_agg(f ORDER BY f.created_at)
                          FROM supplier_fleet f
                          WHERE f.supplier_id = p_supplier_id
                            AND f.organization_id = p_org_id
                            AND f.deleted_at IS NULL),
                         '[]'::jsonb),
    'warehouses',      COALESCE(
                         (SELECT jsonb_agg(w ORDER BY w.created_at)
                          FROM supplier_warehouses w
                          WHERE w.supplier_id = p_supplier_id
                            AND w.organization_id = p_org_id
                            AND w.deleted_at IS NULL),
                         '[]'::jsonb)
  )
  INTO v_result
  FROM public.suppliers s
  WHERE s.id = p_supplier_id
    AND s.organization_id = p_org_id;

  RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_supplier_management_bundle(uuid, uuid) TO authenticated;
