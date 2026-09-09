-- DCO review console can read dco_profiles, but profiles RLS only grants
-- SELECT to the person themselves or to driver_kyc.review. Reviewers with
-- dco.review therefore see status and timestamps with "Unknown driver".
-- This function returns the same queue plus the requesting driver's name,
-- phone, and email, gated by can_review_dco(). A matching profiles policy
-- lets the existing two-step join succeed for those same rows.

CREATE OR REPLACE FUNCTION public.list_dco_review_queue()
RETURNS TABLE (
  user_id uuid,
  status text,
  requested_at timestamptz,
  reviewed_at timestamptz,
  decision_reason text,
  driver_name text,
  driver_phone text,
  driver_email text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT
    dp.user_id,
    dp.status,
    dp.requested_at,
    dp.reviewed_at,
    dp.decision_reason,
    p.full_name,
    p.phone,
    p.email
  FROM public.dco_profiles dp
  LEFT JOIN public.profiles p ON p.id = dp.user_id
  WHERE public.can_review_dco()
  ORDER BY dp.requested_at DESC;
$function$;

REVOKE ALL ON FUNCTION public.list_dco_review_queue() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_dco_review_queue() FROM anon;
GRANT EXECUTE ON FUNCTION public.list_dco_review_queue() TO authenticated;

DROP POLICY IF EXISTS profiles_dco_reviewer_select ON public.profiles;
CREATE POLICY profiles_dco_reviewer_select ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    public.has_platform_permission((select auth.uid()), 'dco.review')
    AND EXISTS (
      SELECT 1 FROM public.dco_profiles dp
      WHERE dp.user_id = profiles.id
    )
  );
