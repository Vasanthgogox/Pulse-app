-- ════════════════════════════════════════════════════════════════════════════
-- Security fix: 3 critical advisors
--   1. operational_sequences  — RLS disabled, anon has full CRUD
--   2. workspace_members view — SECURITY DEFINER bypasses organization_members RLS
--   3. workspaces view        — SECURITY DEFINER bypasses organizations RLS
-- ════════════════════════════════════════════════════════════════════════════


-- ── 1. operational_sequences: enable RLS + lock down anon ────────────────────
-- Table stores per-org sequence counters (trip numbers, invoice IDs, etc.).
-- Without RLS, any unauthenticated caller with the anon key can read or
-- corrupt every org's counters via the REST API.

ALTER TABLE public.operational_sequences ENABLE ROW LEVEL SECURITY;

-- anon must never touch sequence data — revoke all
REVOKE ALL ON public.operational_sequences FROM anon;

-- Org members can read their own org's sequences (e.g. display "next #")
CREATE POLICY "operational_sequences_select"
  ON public.operational_sequences FOR SELECT
  TO authenticated
  USING (public.is_org_member(organization_id));

-- Org members can increment their own org's sequence counters
-- (fired on trip/invoice/etc creation)
CREATE POLICY "operational_sequences_update"
  ON public.operational_sequences FOR UPDATE
  TO authenticated
  USING  (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));

-- Only org admins/owners may create new sequence types for their org
CREATE POLICY "operational_sequences_insert"
  ON public.operational_sequences FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = operational_sequences.organization_id
        AND om.user_id = (SELECT auth.uid())
        AND om.role IN ('owner', 'admin')
        AND om.status = 'active'
    )
  );

-- No one deletes sequence rows from the app (service_role only)
-- No DELETE policy = authenticated role cannot delete.


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

-- anon must not enumerate org/KYC data
REVOKE ALL ON public.workspaces FROM anon;
