-- Fix Advisor CRITICAL: RLS disabled on public tables.
-- All are internal/system tables (monitoring, sequences, event registry,
-- tracking partition) with no direct client access — service role / RPCs only.
-- Enabling RLS with no policies blocks anon/authenticated by default.

ALTER TABLE public._monitor_stmt_snapshot ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operational_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_schema_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_metrics ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'trip_location_checkpoints_default') THEN
    ALTER TABLE public.trip_location_checkpoints_default ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

-- Fix Advisor CRITICAL: Security Definer View on workspaces / workspace_members.
-- 20260605073627 set security_invoker = true on both views (so they respect
-- caller RLS instead of running as the view owner). 20260801000000 did
-- CREATE OR REPLACE VIEW on both without WITH (security_invoker = true) and
-- without the REVOKE ALL FROM anon grants, silently reverting that fix —
-- any anon/authenticated caller could enumerate every org's KYC data
-- (GSTIN, PAN, CIN) and team membership via SECURITY DEFINER bypassing RLS.

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

REVOKE ALL ON public.workspaces FROM anon;

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

REVOKE ALL ON public.workspace_members FROM anon;
