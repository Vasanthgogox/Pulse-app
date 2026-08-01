-- Bootstrap stub for has_platform_permission(uuid, text).
--
-- The real implementation (backed by platform_role_members/platform_users/
-- platform_role_permissions/platform_permissions) isn't introduced until
-- 20261224000000_platform_iam.sql -- five months later in this migration
-- history. driver_kyc_submission_gate.sql (the very next migration,
-- 20260731055903) references has_platform_permission() in an RLS policy, so
-- a from-scratch `supabase db reset` fails here with
-- "function public.has_platform_permission(uuid, unknown) does not exist"
-- before the real IAM tables even exist to back a real implementation.
--
-- This stub fails closed (always false — no one has elevated platform
-- permission yet) rather than depending on tables that don't exist until
-- 20261224000000. That migration's CREATE OR REPLACE FUNCTION overwrites
-- this stub with the real, table-backed implementation once the IAM schema
-- exists; nothing in between should ever rely on this stub actually
-- granting anything.

CREATE OR REPLACE FUNCTION public.has_platform_permission(p_user_id uuid, p_permission text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT false;
$$;

REVOKE ALL ON FUNCTION public.has_platform_permission(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_platform_permission(uuid, text) TO authenticated;
