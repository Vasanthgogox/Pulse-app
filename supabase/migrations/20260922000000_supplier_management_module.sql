-- Supplier Management Module — supplier CRM / KYC / compliance / contracts / fleet / warehouses
-- Mirrors the client_management_module (20260911000000) for the supplier domain.
--
-- RECONSTRUCTED: This file was regenerated from production state on 2026-06-14.
-- The original migration was applied to production but its SQL file was never committed.
-- It was subsequently reverted from supabase_migrations tracking via
--   `supabase migration repair --status reverted 20260922000000`
-- The schema objects it created still exist in production.
-- This file is idempotent (IF NOT EXISTS / CREATE OR REPLACE / DROP IF EXISTS before recreate).

-- ─── supplier_contacts ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.supplier_contacts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  supplier_id     uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  name            text NOT NULL,
  designation     text,
  mobile          text,
  email           text,
  department      text,
  is_primary      boolean NOT NULL DEFAULT false,
  is_operations   boolean NOT NULL DEFAULT false,
  is_finance      boolean NOT NULL DEFAULT false,
  is_dispatch     boolean NOT NULL DEFAULT false,
  notes           text,
  created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);

CREATE INDEX IF NOT EXISTS idx_supplier_contacts_supplier
  ON public.supplier_contacts (supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_contacts_org
  ON public.supplier_contacts (organization_id);

ALTER TABLE public.supplier_contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org members manage supplier contacts" ON public.supplier_contacts;
CREATE POLICY "Org members manage supplier contacts"
  ON public.supplier_contacts FOR ALL
  TO authenticated
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.supplier_contacts TO authenticated;
GRANT ALL ON public.supplier_contacts TO service_role;

DROP TRIGGER IF EXISTS trg_supplier_contacts_updated_at ON public.supplier_contacts;
CREATE TRIGGER trg_supplier_contacts_updated_at
  BEFORE UPDATE ON public.supplier_contacts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── supplier_kyc_documents ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.supplier_kyc_documents (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  supplier_id     uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  doc_type        text NOT NULL,
  doc_label       text,
  storage_path    text,
  file_name       text,
  mime_type       text,
  expiry_date     date,
  version_number  integer NOT NULL DEFAULT 1,
  is_mandatory    boolean NOT NULL DEFAULT false,
  status          text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'verified', 'rejected', 'expired')),
  verified_at     timestamptz,
  verified_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  notes           text,
  created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);

CREATE INDEX IF NOT EXISTS idx_supplier_kyc_supplier
  ON public.supplier_kyc_documents (supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_kyc_org
  ON public.supplier_kyc_documents (organization_id);

ALTER TABLE public.supplier_kyc_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org members manage supplier kyc documents" ON public.supplier_kyc_documents;
CREATE POLICY "Org members manage supplier kyc documents"
  ON public.supplier_kyc_documents FOR ALL
  TO authenticated
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.supplier_kyc_documents TO authenticated;
GRANT ALL ON public.supplier_kyc_documents TO service_role;

DROP TRIGGER IF EXISTS trg_supplier_kyc_documents_updated_at ON public.supplier_kyc_documents;
CREATE TRIGGER trg_supplier_kyc_documents_updated_at
  BEFORE UPDATE ON public.supplier_kyc_documents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── supplier_compliance_documents ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.supplier_compliance_documents (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  supplier_id     uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  doc_type        text NOT NULL,
  label           text NOT NULL,
  storage_path    text,
  file_name       text,
  expiry_date     date,
  status          text NOT NULL DEFAULT 'amber',
  notes           text,
  created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);

CREATE INDEX IF NOT EXISTS idx_supplier_compliance_docs_supplier
  ON public.supplier_compliance_documents (supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_compliance_docs_org
  ON public.supplier_compliance_documents (organization_id);

ALTER TABLE public.supplier_compliance_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org members manage supplier compliance documents" ON public.supplier_compliance_documents;
CREATE POLICY "Org members manage supplier compliance documents"
  ON public.supplier_compliance_documents FOR ALL
  TO authenticated
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.supplier_compliance_documents TO authenticated;
GRANT ALL ON public.supplier_compliance_documents TO service_role;

DROP TRIGGER IF EXISTS trg_supplier_compliance_docs_updated_at ON public.supplier_compliance_documents;
CREATE TRIGGER trg_supplier_compliance_docs_updated_at
  BEFORE UPDATE ON public.supplier_compliance_documents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── supplier_contract_agreements ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.supplier_contract_agreements (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  supplier_id     uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  contract_number text NOT NULL,
  title           text,
  status          text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'expired', 'terminated', 'renewal_pending')),
  rate_type       text,
  effective_date  date,
  expiry_date     date,
  payment_terms   jsonb,
  sla_terms       jsonb,
  general_terms   text,
  signed_storage_path text,
  notes           text,
  created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);

CREATE INDEX IF NOT EXISTS idx_supplier_contract_agreements_supplier
  ON public.supplier_contract_agreements (supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_contract_agreements_org
  ON public.supplier_contract_agreements (organization_id);

ALTER TABLE public.supplier_contract_agreements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org members manage supplier contract agreements" ON public.supplier_contract_agreements;
CREATE POLICY "Org members manage supplier contract agreements"
  ON public.supplier_contract_agreements FOR ALL
  TO authenticated
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.supplier_contract_agreements TO authenticated;
GRANT ALL ON public.supplier_contract_agreements TO service_role;

DROP TRIGGER IF EXISTS trg_supplier_contract_agreements_updated_at ON public.supplier_contract_agreements;
CREATE TRIGGER trg_supplier_contract_agreements_updated_at
  BEFORE UPDATE ON public.supplier_contract_agreements
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── supplier_fleet ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.supplier_fleet (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  supplier_id         uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  vehicle_number      text NOT NULL,
  vehicle_type        text,
  capacity_tons       numeric,
  ownership           text NOT NULL DEFAULT 'owned',
  insurance_expiry    date,
  fitness_expiry      date,
  permit_expiry       date,
  has_gps             boolean NOT NULL DEFAULT false,
  driver_id           uuid REFERENCES public.drivers(id) ON DELETE SET NULL,
  notes               text,
  created_by          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  deleted_at          timestamptz
);

CREATE INDEX IF NOT EXISTS idx_supplier_fleet_supplier
  ON public.supplier_fleet (supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_fleet_org
  ON public.supplier_fleet (organization_id);

ALTER TABLE public.supplier_fleet ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org members manage supplier fleet" ON public.supplier_fleet;
CREATE POLICY "Org members manage supplier fleet"
  ON public.supplier_fleet FOR ALL
  TO authenticated
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.supplier_fleet TO authenticated;
GRANT ALL ON public.supplier_fleet TO service_role;

DROP TRIGGER IF EXISTS trg_supplier_fleet_updated_at ON public.supplier_fleet;
CREATE TRIGGER trg_supplier_fleet_updated_at
  BEFORE UPDATE ON public.supplier_fleet
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── supplier_warehouses ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.supplier_warehouses (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id         uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  supplier_id             uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  name                    text NOT NULL,
  address                 text,
  city                    text,
  state                   text,
  pincode                 text,
  contact_name            text,
  contact_phone           text,
  storage_capacity_tons   numeric,
  loading_bays            integer,
  notes                   text,
  created_by              uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  deleted_at              timestamptz
);

CREATE INDEX IF NOT EXISTS idx_supplier_warehouses_supplier
  ON public.supplier_warehouses (supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_warehouses_org
  ON public.supplier_warehouses (organization_id);

ALTER TABLE public.supplier_warehouses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org members manage supplier warehouses" ON public.supplier_warehouses;
CREATE POLICY "Org members manage supplier warehouses"
  ON public.supplier_warehouses FOR ALL
  TO authenticated
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.supplier_warehouses TO authenticated;
GRANT ALL ON public.supplier_warehouses TO service_role;

DROP TRIGGER IF EXISTS trg_supplier_warehouses_updated_at ON public.supplier_warehouses;
CREATE TRIGGER trg_supplier_warehouses_updated_at
  BEFORE UPDATE ON public.supplier_warehouses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
