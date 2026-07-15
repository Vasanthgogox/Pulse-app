-- ════════════════════════════════════════════════════════════════════════════
-- Security fix: 3 critical advisors
--   1. operational_sequences  — RLS disabled, anon has full CRUD
--   2. workspace_members view — SECURITY DEFINER bypasses organization_members RLS
--   3. workspaces view        — SECURITY DEFINER bypasses organizations RLS
-- ════════════════════════════════════════════════════════════════════════════


-- ── 1. operational_sequences: enable RLS + lock down anon ────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'operational_sequences') THEN
    RETURN; -- table created in a later migration; security applied there
  END IF;

  ALTER TABLE public.operational_sequences ENABLE ROW LEVEL SECURITY;
  REVOKE ALL ON public.operational_sequences FROM anon;

  DROP POLICY IF EXISTS "operational_sequences_select" ON public.operational_sequences;
  CREATE POLICY "operational_sequences_select"
    ON public.operational_sequences FOR SELECT TO authenticated
    USING (public.is_org_member(organization_id));

  DROP POLICY IF EXISTS "operational_sequences_update" ON public.operational_sequences;
  CREATE POLICY "operational_sequences_update"
    ON public.operational_sequences FOR UPDATE TO authenticated
    USING  (public.is_org_member(organization_id))
    WITH CHECK (public.is_org_member(organization_id));

  DROP POLICY IF EXISTS "operational_sequences_insert" ON public.operational_sequences;
  CREATE POLICY "operational_sequences_insert"
    ON public.operational_sequences FOR INSERT TO authenticated
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.organization_members om
        WHERE om.organization_id = operational_sequences.organization_id
          AND om.user_id = (SELECT auth.uid())
          AND om.role IN ('owner', 'admin')
          AND om.status = 'active'
      )
    );
END $$;


-- ── 2. workspace_members: replace SECURITY DEFINER with security_invoker ─────
-- This view is a rename-alias over organization_members.
-- SECURITY DEFINER means it runs as the view owner (postgres), bypassing
-- the RLS we just hardened on organization_members — anon could read all
-- team member records.
-- Postgres 15+ fix: security_invoker makes the view respect the caller's RLS.

CREATE OR REPLACE VIEW public.workspace_members
  WITH (security_invoker = true)
AS
  SELECT
    id,
    organization_id AS workspace_id,
    user_id,
    role,
    status,
    created_at,
    updated_at
  FROM public.organization_members;

-- anon has no business reading org membership data
REVOKE ALL ON public.workspace_members FROM anon;


-- ── 3. workspaces: replace SECURITY DEFINER with security_invoker ────────────
-- View over organizations. SECURITY DEFINER + anon SELECT = any unauthenticated
-- caller can enumerate every org's name, owner, GSTIN, PAN, CIN (KYC data).
-- After this fix, the view inherits organizations RLS: only active members
-- of an org can see it.

CREATE OR REPLACE VIEW public.workspaces
  WITH (security_invoker = true)
AS
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
    deleted_at,
    created_at,
    updated_at
  FROM public.organizations;
  -- KYC columns (business_pan, gstin, cin, etc.) added by 20260801000000_workspace_kyc_structure

-- anon must not enumerate org/KYC data
REVOKE ALL ON public.workspaces FROM anon;
