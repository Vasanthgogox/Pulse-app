-- Surface driver avatar on list_driver_direct_bids_for_post so Review Hub /
-- Story owner bids can render PartyAvatar instead of a generic truck glyph.
-- Must DROP first: return row type gains avatar columns (Postgres 42P13).

DROP FUNCTION IF EXISTS public.list_driver_direct_bids_for_post(uuid);

CREATE FUNCTION public.list_driver_direct_bids_for_post(p_post_id uuid)
RETURNS TABLE (
  id                  uuid,
  post_id             uuid,
  driver_user_id      uuid,
  driver_display_name text,
  driver_avatar_url   text,
  driver_avatar_seed  text,
  is_fleet_owner      boolean,
  amount              numeric,
  note                text,
  status              text,
  counter_amount      numeric,
  created_at          timestamptz,
  updated_at          timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_post_id IS NULL THEN
    RAISE EXCEPTION 'post_id required';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.posts p
    JOIN public.organization_members om
      ON om.organization_id = p.organization_id
     AND om.user_id = v_uid
     AND om.status = 'active'
    WHERE p.id = p_post_id
  ) THEN
    RAISE EXCEPTION 'unauthorized: caller must belong to the post organization';
  END IF;

  RETURN QUERY
  SELECT
    ddb.id,
    ddb.post_id,
    ddb.driver_user_id,
    COALESCE(NULLIF(TRIM(pr.full_name), ''), 'Driver') AS driver_display_name,
    NULLIF(TRIM(pr.avatar_url), '') AS driver_avatar_url,
    NULLIF(TRIM(pr.avatar_seed), '') AS driver_avatar_seed,
    EXISTS (
      SELECT 1
      FROM public.driver_fleet_owner_profiles fop
      WHERE fop.user_id = ddb.driver_user_id
    ) AS is_fleet_owner,
    ddb.amount,
    ddb.note,
    ddb.status,
    ddb.counter_amount,
    ddb.created_at,
    ddb.updated_at
  FROM public.driver_direct_bids ddb
  LEFT JOIN public.profiles pr ON pr.id = ddb.driver_user_id
  WHERE ddb.post_id = p_post_id
  ORDER BY ddb.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.list_driver_direct_bids_for_post(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_driver_direct_bids_for_post(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_driver_direct_bids_for_post(uuid) TO service_role;

COMMENT ON FUNCTION public.list_driver_direct_bids_for_post(uuid) IS
  'Shipper org members: list driver_direct_bids on their post with display name, avatar, and is_fleet_owner for Review Hub / Story bids UI.';
