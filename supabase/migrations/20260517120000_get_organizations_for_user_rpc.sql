-- App fallback when organization_members direct query is empty: list orgs for current user
-- and backfill owner membership rows. (Some projects had this only in legacy dumps, not in supabase/migrations.)

CREATE OR REPLACE FUNCTION public.get_organizations_for_user()
RETURNS TABLE (id uuid, name text, slug text, owner_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT o.id, o.name, o.slug, o.owner_id
  FROM public.organizations o
  WHERE EXISTS (
    SELECT 1
    FROM public.organization_members om
    WHERE om.organization_id = o.id
      AND om.user_id = v_uid
      AND om.status = 'active'
  );

  IF FOUND THEN
    RETURN;
  END IF;

  INSERT INTO public.organization_members (organization_id, user_id, role, status)
  SELECT o.id, o.owner_id, 'owner', 'active'
  FROM public.organizations o
  WHERE o.owner_id = v_uid
    AND NOT EXISTS (
      SELECT 1
      FROM public.organization_members om
      WHERE om.organization_id = o.id
        AND om.user_id = o.owner_id
    )
  ON CONFLICT (organization_id, user_id) DO UPDATE
  SET status = 'active', role = 'owner';

  RETURN QUERY
  SELECT o.id, o.name, o.slug, o.owner_id
  FROM public.organizations o
  WHERE o.owner_id = v_uid;
END;
$$;

REVOKE ALL ON FUNCTION public.get_organizations_for_user() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_organizations_for_user() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_organizations_for_user() TO service_role;

COMMENT ON FUNCTION public.get_organizations_for_user() IS
  'Orgs for current user (memberships or owned); backfills owner organization_members when missing.';
