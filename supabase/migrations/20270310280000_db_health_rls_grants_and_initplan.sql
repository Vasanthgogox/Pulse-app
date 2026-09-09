-- Remainder after 20260908202905 / 20260908203002 (already on remote).
-- Drop the per-profile dco.review policy (it made has_platform_permission
-- start on ordinary profile reads), initplan remaining admin/KYC policies,
-- cheapen ratings RLS, and let story viewers SELECT their own upsert rows.
DROP POLICY IF EXISTS organizations_platform_admin_update ON public.organizations;
CREATE POLICY organizations_platform_admin_update ON public.organizations
  FOR UPDATE
  TO authenticated
  USING ((SELECT public.has_platform_permission((SELECT auth.uid()), 'verification.approve')))
  WITH CHECK ((SELECT public.has_platform_permission((SELECT auth.uid()), 'verification.approve')));

DROP POLICY IF EXISTS profiles_platform_admin_select ON public.profiles;
CREATE POLICY profiles_platform_admin_select ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    (
      (SELECT public.has_platform_permission((SELECT auth.uid()), 'verification.review'))
      OR (SELECT public.has_platform_permission((SELECT auth.uid()), 'verification.approve'))
    )
    AND EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.user_id = profiles.id
    )
  );

DROP POLICY IF EXISTS profiles_driver_kyc_reviewer_select ON public.profiles;
CREATE POLICY profiles_driver_kyc_reviewer_select ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    (SELECT public.has_platform_permission((SELECT auth.uid()), 'driver_kyc.review'))
    AND (
      EXISTS (
        SELECT 1 FROM public.driver_kyc_submissions s
        WHERE s.driver_user_id = profiles.id
      )
      OR EXISTS (
        SELECT 1 FROM public.driver_kyc_documents d
        WHERE d.driver_user_id = profiles.id
      )
    )
  );

-- Do not keep a dco.review SELECT on profiles — it duplicates the KYC pattern
-- on every profile read. Queue identity is the RPC below.
DROP POLICY IF EXISTS profiles_dco_reviewer_select ON public.profiles;

-- ── 3. Ratings: membership set instead of per-row is_org_member() ──────────
DROP POLICY IF EXISTS "Users can manage ratings in their org" ON public.ratings;
CREATE POLICY "Users can manage ratings in their org"
  ON public.ratings
  FOR ALL
  TO authenticated
  USING (
    organization_id IN (
      SELECT om.organization_id
      FROM public.organization_members om
      WHERE om.user_id = (SELECT auth.uid())
        AND om.status = 'active'
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT om.organization_id
      FROM public.organization_members om
      WHERE om.user_id = (SELECT auth.uid())
        AND om.status = 'active'
    )
  );

DROP POLICY IF EXISTS "ratings_select_rated_client_when_linked_to_my_org" ON public.ratings;
CREATE POLICY "ratings_select_rated_client_when_linked_to_my_org"
  ON public.ratings
  FOR SELECT
  TO authenticated
  USING (
    rated_type = 'client'
    AND EXISTS (
      SELECT 1
      FROM public.clients c
      WHERE c.id = ratings.rated_id
        AND c.linked_organization_id IN (
          SELECT om.organization_id
          FROM public.organization_members om
          WHERE om.user_id = (SELECT auth.uid())
            AND om.status = 'active'
        )
    )
  );

-- ── 4. story_views: viewers must SELECT their row for ON CONFLICT upsert ───
DROP POLICY IF EXISTS story_views_select_viewer ON public.story_views;
CREATE POLICY story_views_select_viewer ON public.story_views
  FOR SELECT
  TO authenticated
  USING (viewer_user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS story_views_insert ON public.story_views;
CREATE POLICY story_views_insert ON public.story_views
  FOR INSERT
  TO authenticated
  WITH CHECK (viewer_user_id = (SELECT auth.uid()));

-- ── 5. DCO review queue with driver identity (no extra profiles RLS) ───────
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
GRANT EXECUTE ON FUNCTION public.list_dco_review_queue() TO service_role;
