-- Fix pool-saturation incident (2026-09-16 11:21-12:20 UTC): profiles and
-- organization_members are the two hottest tables in the app (hit on nearly
-- every login/session/auth check), and both carried RLS SELECT policies that
-- do per-row admin/KYC work. Same anti-pattern class as the driver_locations
-- incident earlier today (20270920100100), but on much hotter tables, which
-- is why this outage was broader (profiles, auth/v1/user, organization_members,
-- plus everything downstream of a starved pool) and longer.
--
-- Root causes found (from repo state -- 20260903072324, 20270310280000):
--   1) org_members_platform_admin_select called has_platform_permission()
--      unwrapped -- not cached as a scalar-subquery initPlan, so Postgres can
--      re-evaluate the 4-table-join function per row.
--   2) profiles_driver_kyc_reviewer_select already wraps the permission check
--      as (SELECT has_platform_permission(...)) (fixed in 20270310280000), but
--      still ANDs two correlated EXISTS subqueries (driver_kyc_submissions,
--      driver_kyc_documents) evaluated per row of profiles for every profiles
--      SELECT, even for non-reviewers reading their own row.
--   3) profiles_platform_admin_select already wraps the permission check too,
--      ANDed with one correlated EXISTS on organization_members -- same shape,
--      lower fixed cost (organization_members.user_id is indexed), left as-is
--      here; flagging as a TODO if it needs the same RPC treatment later.
--
-- Fix:
--   1) org_members_platform_admin_select -- wrap has_platform_permission() as
--      (SELECT ...) so it becomes a per-statement initPlan instead of a
--      per-row call, matching the pattern already used elsewhere in this file
--      (org_members_platform_admin_update, profiles_platform_admin_select).
--   2) profiles_driver_kyc_reviewer_select -- drop entirely, same rationale as
--      the profiles_dco_reviewer_select removal in 20270310280000: no shipped
--      screen queries profiles directly for KYC review (driverKycDocuments
--      service reads driver_kyc_documents/driver_kyc_submissions, not
--      profiles), so ordinary profile reads should not pay for it. Reviewer
--      access to driver identity is now a narrow RPC instead.
--
-- TODO (not done here, scope was profiles + organization_members SELECT only):
--   revisit profiles_platform_admin_select if it shows up as hot under load --
--   same EXISTS-per-row shape as (2), just lower fixed cost today.

DROP POLICY IF EXISTS org_members_platform_admin_select ON public.organization_members;

CREATE POLICY org_members_platform_admin_select ON public.organization_members
  FOR SELECT
  TO authenticated
  USING (
    (SELECT public.has_platform_permission((SELECT auth.uid()), 'verification.review'))
    OR (SELECT public.has_platform_permission((SELECT auth.uid()), 'verification.approve'))
  );

DROP POLICY IF EXISTS profiles_driver_kyc_reviewer_select ON public.profiles;

-- Batch, not single-id: analytics/src/lib/driverKyc.ts fetchDriverKycQueue()
-- fetches profiles for a whole queue page via .in('id', driverIds), so the
-- replacement RPC must accept the same shape or that queue silently loses
-- driver names/phones after this policy drops.
CREATE OR REPLACE FUNCTION public.get_driver_kyc_reviewer_profiles(p_driver_user_ids uuid[])
RETURNS TABLE (
  id uuid,
  full_name text,
  email text,
  phone text,
  avatar_url text,
  avatar_seed text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT p.id, p.full_name, p.email, p.phone, p.avatar_url, p.avatar_seed
  FROM public.profiles p
  WHERE p.id = ANY (p_driver_user_ids)
    AND (SELECT public.has_platform_permission((SELECT auth.uid()), 'driver_kyc.review'))
    AND (
      EXISTS (
        SELECT 1 FROM public.driver_kyc_submissions s
        WHERE s.driver_user_id = p.id
      )
      OR EXISTS (
        SELECT 1 FROM public.driver_kyc_documents d
        WHERE d.driver_user_id = p.id
      )
    );
$function$;

REVOKE ALL ON FUNCTION public.get_driver_kyc_reviewer_profiles(uuid[]) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.get_driver_kyc_reviewer_profiles(uuid[]) FROM anon;

GRANT EXECUTE ON FUNCTION public.get_driver_kyc_reviewer_profiles(uuid[]) TO authenticated;

GRANT EXECUTE ON FUNCTION public.get_driver_kyc_reviewer_profiles(uuid[]) TO service_role;

COMMENT ON FUNCTION public.get_driver_kyc_reviewer_profiles(uuid[]) IS
  'Driver profile fields for a KYC reviewer, batched by driver_user_id. Replaces profiles_driver_kyc_reviewer_select (dropped in 20270920100300) so ordinary profiles reads do not pay per-row for KYC EXISTS checks. analytics/src/lib/driverKyc.ts fetchDriverKycQueue() must call this instead of a direct profiles .in() query.';
