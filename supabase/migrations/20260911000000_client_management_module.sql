-- Client Management Module — enterprise CRM / KYC / contracts / warehouses
-- Extends clients + related tables for logistics customer management.

-- ─── Extend clients ───────────────────────────────────────────────────────────
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS legal_name text,
  ADD COLUMN IF NOT EXISTS trade_name text,
  ADD COLUMN IF NOT EXISTS client_code text,
  ADD COLUMN IF NOT EXISTS cin text,
  ADD COLUMN IF NOT EXISTS msme_number text,
  ADD COLUMN IF NOT EXISTS iec_number text,
  ADD COLUMN IF NOT EXISTS website text,
  ADD COLUMN IF NOT EXISTS industry text,
  ADD COLUMN IF NOT EXISTS country text DEFAULT 'India',
  ADD COLUMN IF NOT EXISTS state text,
  ADD COLUMN IF NOT EXISTS registered_address text,
  ADD COLUMN IF NOT EXISTS corporate_address text,
  ADD COLUMN IF NOT EXISTS client_status text DEFAULT 'customer'
    CHECK (client_status IN ('prospect','customer','inactive','blacklisted')),
  ADD COLUMN IF NOT EXISTS annual_revenue numeric(16,2),
  ADD COLUMN IF NOT EXISTS expected_monthly_loads integer,
  ADD COLUMN IF NOT EXISTS commodity_types text[],
  ADD COLUMN IF NOT EXISTS operating_regions text[],
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_org_client_code
  ON public.clients (organization_id, client_code)
  WHERE client_code IS NOT NULL AND deleted_at IS NULL;

-- ─── client_contacts ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.client_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  name text NOT NULL,
  designation text,
  mobile text,
  email text,
  department text,
  is_primary boolean DEFAULT false NOT NULL,
  is_decision_maker boolean DEFAULT false NOT NULL,
  is_operations boolean DEFAULT false NOT NULL,
  is_finance boolean DEFAULT false NOT NULL,
  is_procurement boolean DEFAULT false NOT NULL,
  is_dispatch boolean DEFAULT false NOT NULL,
  is_billing boolean DEFAULT false NOT NULL,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_client_contacts_client ON public.client_contacts(client_id);
CREATE INDEX IF NOT EXISTS idx_client_contacts_org ON public.client_contacts(organization_id);
ALTER TABLE public.client_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members manage client contacts"
  ON public.client_contacts FOR ALL
  TO authenticated
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_contacts TO authenticated;

-- ─── client_kyc_documents ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.client_kyc_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  doc_type text NOT NULL CHECK (doc_type IN (
    'gst_certificate','pan_card','cin_certificate','msme_certificate',
    'cancelled_cheque','bank_letter','incorporation_certificate',
    'board_resolution','authorized_signatory','iec','trade_license',
    'udyam','other'
  )),
  doc_label text,
  storage_path text,
  file_name text,
  mime_type text,
  expiry_date date,
  version_number integer DEFAULT 1 NOT NULL,
  is_mandatory boolean DEFAULT false NOT NULL,
  status text DEFAULT 'pending' CHECK (status IN ('pending','verified','rejected','expired')),
  verified_at timestamptz,
  verified_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_client_kyc_client ON public.client_kyc_documents(client_id);
CREATE INDEX IF NOT EXISTS idx_client_kyc_org ON public.client_kyc_documents(organization_id);
ALTER TABLE public.client_kyc_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members manage client kyc"
  ON public.client_kyc_documents FOR ALL
  TO authenticated
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_kyc_documents TO authenticated;

-- ─── Extend client_warehouses ─────────────────────────────────────────────────
ALTER TABLE public.client_warehouses
  ADD COLUMN IF NOT EXISTS warehouse_code text,
  ADD COLUMN IF NOT EXISTS pincode text,
  ADD COLUMN IF NOT EXISTS latitude numeric(10,7),
  ADD COLUMN IF NOT EXISTS longitude numeric(10,7),
  ADD COLUMN IF NOT EXISTS operating_hours text,
  ADD COLUMN IF NOT EXISTS loading_type text,
  ADD COLUMN IF NOT EXISTS unloading_type text,
  ADD COLUMN IF NOT EXISTS dock_count integer,
  ADD COLUMN IF NOT EXISTS capacity_tons numeric(12,2),
  ADD COLUMN IF NOT EXISTS handling_equipment text,
  ADD COLUMN IF NOT EXISTS manager_name text,
  ADD COLUMN IF NOT EXISTS manager_phone text,
  ADD COLUMN IF NOT EXISTS security_contact text,
  ADD COLUMN IF NOT EXISTS ops_contact text,
  ADD COLUMN IF NOT EXISTS billing_address text,
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- ─── client_contract_agreements (header + terms) ───────────────────────────────
CREATE TABLE IF NOT EXISTS public.client_contract_agreements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  contract_number text NOT NULL,
  title text,
  status text DEFAULT 'draft' CHECK (status IN ('draft','active','expired','terminated','renewal_pending')),
  commercial_model text DEFAULT 'per_trip' CHECK (commercial_model IN (
    'per_trip','per_ton','per_km','per_vehicle_type','fixed_monthly'
  )),
  effective_date date,
  expiry_date date,
  renewal_date date,
  payment_terms jsonb DEFAULT '{}'::jsonb,
  detention_terms jsonb DEFAULT '{}'::jsonb,
  penalty_clauses jsonb DEFAULT '{}'::jsonb,
  claims_terms jsonb DEFAULT '{}'::jsonb,
  escalation_matrix jsonb DEFAULT '[]'::jsonb,
  general_terms text,
  signed_storage_path text,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_client_contract_agreements_client
  ON public.client_contract_agreements(client_id);
CREATE INDEX IF NOT EXISTS idx_client_contract_agreements_org
  ON public.client_contract_agreements(organization_id);
ALTER TABLE public.client_contract_agreements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members manage client contract agreements"
  ON public.client_contract_agreements FOR ALL
  TO authenticated
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_contract_agreements TO authenticated;

-- ─── client_contract_versions ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.client_contract_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  agreement_id uuid NOT NULL REFERENCES public.client_contract_agreements(id) ON DELETE CASCADE,
  version_number integer NOT NULL DEFAULT 1,
  storage_path text NOT NULL,
  file_name text,
  effective_date date,
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_client_contract_versions_agreement
  ON public.client_contract_versions(agreement_id);
ALTER TABLE public.client_contract_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members manage contract versions"
  ON public.client_contract_versions FOR ALL
  TO authenticated
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_contract_versions TO authenticated;

-- ─── client_lane_rates ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.client_lane_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  agreement_id uuid REFERENCES public.client_contract_agreements(id) ON DELETE SET NULL,
  origin_warehouse_id uuid REFERENCES public.client_warehouses(id) ON DELETE SET NULL,
  destination_warehouse_id uuid REFERENCES public.client_warehouses(id) ON DELETE SET NULL,
  origin_label text NOT NULL,
  destination_label text NOT NULL,
  vehicle_type text,
  rate numeric(14,2),
  rate_type text DEFAULT 'per_trip' CHECK (rate_type IN (
    'per_trip','per_ton','per_kg','per_km','fixed','spot'
  )),
  min_billing numeric(14,2),
  fuel_clause text,
  toll_included boolean DEFAULT false,
  detention_included boolean DEFAULT false,
  valid_from date,
  valid_to date,
  is_spot_rate boolean DEFAULT false NOT NULL,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_client_lane_rates_client ON public.client_lane_rates(client_id);
CREATE INDEX IF NOT EXISTS idx_client_lane_rates_agreement ON public.client_lane_rates(agreement_id);
ALTER TABLE public.client_lane_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members manage client lane rates"
  ON public.client_lane_rates FOR ALL
  TO authenticated
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_lane_rates TO authenticated;

-- ─── client_finance_profiles ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.client_finance_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  opening_balance numeric(14,2) DEFAULT 0,
  credit_limit numeric(14,2),
  credit_days integer DEFAULT 30,
  billing_cycle text DEFAULT 'monthly',
  invoice_frequency text DEFAULT 'per_trip',
  dso_target_days integer,
  aging_0_30 numeric(14,2) DEFAULT 0,
  aging_31_60 numeric(14,2) DEFAULT 0,
  aging_61_90 numeric(14,2) DEFAULT 0,
  aging_90_plus numeric(14,2) DEFAULT 0,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE (client_id)
);

ALTER TABLE public.client_finance_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members manage client finance profiles"
  ON public.client_finance_profiles FOR ALL
  TO authenticated
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_finance_profiles TO authenticated;

-- ─── client_documents (vault) ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.client_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  folder text DEFAULT 'general',
  doc_type text DEFAULT 'other',
  title text NOT NULL,
  storage_path text,
  file_name text,
  mime_type text,
  version_number integer DEFAULT 1 NOT NULL,
  expiry_date date,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_client_documents_client ON public.client_documents(client_id);
ALTER TABLE public.client_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members manage client documents"
  ON public.client_documents FOR ALL
  TO authenticated
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_documents TO authenticated;

-- ─── client_audit_log ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.client_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  entity_type text NOT NULL,
  entity_id uuid,
  action text NOT NULL CHECK (action IN ('create','update','delete','upload','verify','status_change')),
  field_name text,
  old_value text,
  new_value text,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_name text,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_client_audit_log_client ON public.client_audit_log(client_id, created_at DESC);
ALTER TABLE public.client_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members read client audit log"
  ON public.client_audit_log FOR SELECT
  TO authenticated
  USING (public.is_org_member(organization_id));
CREATE POLICY "Org members insert client audit log"
  ON public.client_audit_log FOR INSERT
  TO authenticated
  WITH CHECK (public.is_org_member(organization_id));
GRANT SELECT, INSERT ON public.client_audit_log TO authenticated;

-- ─── Audit trigger helper ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.log_client_audit(
  p_org_id uuid,
  p_client_id uuid,
  p_entity_type text,
  p_entity_id uuid,
  p_action text,
  p_field_name text DEFAULT NULL,
  p_old_value text DEFAULT NULL,
  p_new_value text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.client_audit_log (
    organization_id, client_id, entity_type, entity_id,
    action, field_name, old_value, new_value, actor_id
  ) VALUES (
    p_org_id, p_client_id, p_entity_type, p_entity_id,
    p_action, p_field_name, p_old_value, p_new_value, auth.uid()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_client_audit(uuid,uuid,text,uuid,text,text,text,text) TO authenticated;

-- ─── Bundle RPC ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_client_management_bundle(
  p_org_id uuid,
  p_client_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_client jsonb;
BEGIN
  IF NOT public.is_org_member(p_org_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT to_jsonb(c.*) INTO v_client
  FROM public.clients c
  WHERE c.id = p_client_id
    AND c.organization_id = p_org_id
    AND c.deleted_at IS NULL;

  IF v_client IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'client', v_client,
    'contacts', COALESCE((
      SELECT jsonb_agg(to_jsonb(cc.*) ORDER BY cc.is_primary DESC, cc.created_at)
      FROM public.client_contacts cc
      WHERE cc.client_id = p_client_id AND cc.organization_id = p_org_id AND cc.deleted_at IS NULL
    ), '[]'::jsonb),
    'kyc_documents', COALESCE((
      SELECT jsonb_agg(to_jsonb(k.*) ORDER BY k.doc_type, k.version_number DESC)
      FROM public.client_kyc_documents k
      WHERE k.client_id = p_client_id AND k.organization_id = p_org_id AND k.deleted_at IS NULL
    ), '[]'::jsonb),
    'warehouses', COALESCE((
      SELECT jsonb_agg(to_jsonb(w.*) ORDER BY w.created_at)
      FROM public.client_warehouses w
      WHERE w.client_id = p_client_id AND w.organization_id = p_org_id
        AND (w.deleted_at IS NULL)
    ), '[]'::jsonb),
    'agreements', COALESCE((
      SELECT jsonb_agg(to_jsonb(a.*) ORDER BY a.effective_date DESC NULLS LAST)
      FROM public.client_contract_agreements a
      WHERE a.client_id = p_client_id AND a.organization_id = p_org_id AND a.deleted_at IS NULL
    ), '[]'::jsonb),
    'lane_rates', COALESCE((
      SELECT jsonb_agg(to_jsonb(lr.*) ORDER BY lr.valid_from DESC NULLS LAST)
      FROM public.client_lane_rates lr
      WHERE lr.client_id = p_client_id AND lr.organization_id = p_org_id AND lr.deleted_at IS NULL
    ), '[]'::jsonb),
    'legacy_contracts', COALESCE((
      SELECT jsonb_agg(to_jsonb(ct.*) ORDER BY ct.created_at)
      FROM public.client_contracts ct
      WHERE ct.client_id = p_client_id AND ct.organization_id = p_org_id
    ), '[]'::jsonb),
    'finance_profile', (
      SELECT to_jsonb(fp.*)
      FROM public.client_finance_profiles fp
      WHERE fp.client_id = p_client_id AND fp.organization_id = p_org_id
      LIMIT 1
    ),
    'documents', COALESCE((
      SELECT jsonb_agg(to_jsonb(d.*) ORDER BY d.folder, d.created_at DESC)
      FROM public.client_documents d
      WHERE d.client_id = p_client_id AND d.organization_id = p_org_id AND d.deleted_at IS NULL
    ), '[]'::jsonb),
    'audit_log', COALESCE((
      SELECT jsonb_agg(to_jsonb(al.*) ORDER BY al.created_at DESC)
      FROM (
        SELECT * FROM public.client_audit_log
        WHERE client_id = p_client_id AND organization_id = p_org_id
        ORDER BY created_at DESC
        LIMIT 100
      ) al
    ), '[]'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_client_management_bundle(uuid, uuid) TO authenticated;
