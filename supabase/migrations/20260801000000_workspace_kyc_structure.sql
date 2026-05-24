-- ============================================================
-- Workspace / KYC Structure (Phase 1)
-- ============================================================
-- Adds KYC fields to the existing `organizations` table (our "workspaces").
-- Preserves ALL existing data and foreign-key references — nothing is dropped.
-- Creates `workspaces` + `workspace_members` as views so new app code can
-- use workspace semantics while old code keeps using `organizations` unchanged.
-- ============================================================

-- ============================================================
-- STEP 1: KYC verification status type
-- ============================================================
DO $$ BEGIN
  CREATE TYPE public.kyc_verification_status AS ENUM (
    'unverified',    -- default, no documents submitted
    'pending',       -- documents submitted, awaiting review
    'verified',      -- approved
    'rejected'       -- rejected, can resubmit
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- STEP 2: Add KYC columns to organizations
-- ============================================================
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS business_pan          text,
  ADD COLUMN IF NOT EXISTS gstin                 text,
  ADD COLUMN IF NOT EXISTS cin                   text,
  ADD COLUMN IF NOT EXISTS verification_status   public.kyc_verification_status NOT NULL DEFAULT 'unverified',
  ADD COLUMN IF NOT EXISTS verified_at           timestamptz,
  ADD COLUMN IF NOT EXISTS verified_by           uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS kyc_rejected_reason   text;

-- Format constraints (India)
-- PAN: 5 letters + 4 digits + 1 letter (e.g. ABCDE1234F) — stored uppercase
ALTER TABLE public.organizations
  DROP CONSTRAINT IF EXISTS organizations_business_pan_format;
ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_business_pan_format
    CHECK (business_pan IS NULL OR business_pan ~ '^[A-Z]{5}[0-9]{4}[A-Z]$');

-- GSTIN: 15-char alphanumeric with specific pattern
ALTER TABLE public.organizations
  DROP CONSTRAINT IF EXISTS organizations_gstin_format;
ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_gstin_format
    CHECK (gstin IS NULL OR gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$');

-- CIN: corporate identity number (21 chars)
ALTER TABLE public.organizations
  DROP CONSTRAINT IF EXISTS organizations_cin_format;
ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_cin_format
    CHECK (cin IS NULL OR length(cin) = 21);

-- Unique indices (sparse — NULLs don't conflict)
CREATE UNIQUE INDEX IF NOT EXISTS organizations_pan_unique
  ON public.organizations (business_pan) WHERE business_pan IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS organizations_gstin_unique
  ON public.organizations (gstin) WHERE gstin IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS organizations_cin_unique
  ON public.organizations (cin) WHERE cin IS NOT NULL;

-- ============================================================
-- STEP 3: workspaces VIEW (maps org columns to workspace names)
-- ============================================================
CREATE OR REPLACE VIEW public.workspaces AS
SELECT
  id,
  name,
  slug,
  owner_id,
  operating_model,
  logo_url,
  address_line,
  city,
  state,
  zone,
  business_type,
  employee_count,
  business_pan,
  gstin,
  cin,
  verification_status,
  verified_at,
  verified_by,
  kyc_rejected_reason,
  deleted_at,
  created_at,
  updated_at
FROM public.organizations;

-- ============================================================
-- STEP 4: workspace_members VIEW
-- ============================================================
CREATE OR REPLACE VIEW public.workspace_members AS
SELECT
  id,
  organization_id  AS workspace_id,
  user_id,
  role,
  status,
  created_at,
  updated_at
FROM public.organization_members;

-- ============================================================
-- STEP 5: RPC — update_workspace_kyc
-- Called by the KYC settings panel (owner/admin only).
-- Validates formats server-side; returns updated row.
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_workspace_kyc(
  p_org_id      uuid,
  p_pan         text DEFAULT NULL,
  p_gstin       text DEFAULT NULL,
  p_cin         text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role   text;
  v_pan    text := nullif(trim(upper(p_pan)), '');
  v_gstin  text := nullif(trim(upper(p_gstin)), '');
  v_cin    text := nullif(trim(upper(p_cin)), '');
BEGIN
  -- Caller must be owner or admin of this org
  SELECT role INTO v_role
  FROM public.organization_members
  WHERE organization_id = p_org_id
    AND user_id = auth.uid()
    AND status = 'active';

  IF v_role IS NULL OR v_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'Only workspace owners or admins can update KYC details.';
  END IF;

  -- PAN format
  IF v_pan IS NOT NULL AND v_pan !~ '^[A-Z]{5}[0-9]{4}[A-Z]$' THEN
    RAISE EXCEPTION 'Invalid PAN format. Expected 10 characters like ABCDE1234F.';
  END IF;

  -- GSTIN format
  IF v_gstin IS NOT NULL AND v_gstin !~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$' THEN
    RAISE EXCEPTION 'Invalid GSTIN format. Expected 15-character format.';
  END IF;

  -- CIN format
  IF v_cin IS NOT NULL AND length(v_cin) != 21 THEN
    RAISE EXCEPTION 'Invalid CIN format. Expected 21 characters.';
  END IF;

  UPDATE public.organizations
  SET
    business_pan        = COALESCE(v_pan, business_pan),
    gstin               = COALESCE(v_gstin, gstin),
    cin                 = COALESCE(v_cin, cin),
    -- Submitting any new KYC field moves status to pending (if currently unverified)
    verification_status = CASE
      WHEN verification_status = 'unverified'
       AND (v_pan IS NOT NULL OR v_gstin IS NOT NULL OR v_cin IS NOT NULL)
      THEN 'pending'::public.kyc_verification_status
      ELSE verification_status
    END,
    updated_at          = now()
  WHERE id = p_org_id;

  RETURN (
    SELECT jsonb_build_object(
      'id',                  id,
      'business_pan',        business_pan,
      'gstin',               gstin,
      'cin',                 cin,
      'verification_status', verification_status,
      'verified_at',         verified_at
    )
    FROM public.organizations WHERE id = p_org_id
  );
END;
$$;

-- ============================================================
-- STEP 6: RPC — get_workspace_kyc_status
-- Returns current KYC details for owner/admin/member.
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_workspace_kyc_status(p_org_id uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'id',                  o.id,
    'name',                o.name,
    'logo_url',            o.logo_url,
    'business_pan',        o.business_pan,
    'gstin',               o.gstin,
    'cin',                 o.cin,
    'verification_status', o.verification_status,
    'verified_at',         o.verified_at,
    'kyc_rejected_reason', o.kyc_rejected_reason
  )
  FROM public.organizations o
  JOIN public.organization_members om
    ON om.organization_id = o.id
   AND om.user_id = auth.uid()
   AND om.status = 'active'
  WHERE o.id = p_org_id;
$$;

-- ============================================================
-- STEP 7: Grants for new RPCs
-- ============================================================
GRANT EXECUTE ON FUNCTION public.update_workspace_kyc(uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_workspace_kyc_status(uuid) TO authenticated;
