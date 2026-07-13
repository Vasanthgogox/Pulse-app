-- Mutual connections between viewer org and a discover target org.
-- Client-side joins on connection_requests fail under RLS: members only
-- see rows where their org is from/to, not third-party links for the target.
-- discover_organizations computes mutual_count via SECURITY DEFINER; this RPC
-- returns the same mutual org rows for the facepile + modal.

CREATE OR REPLACE FUNCTION public.get_mutual_connections(
  p_viewer_org_id uuid,
  p_target_org_id uuid
)
RETURNS TABLE (
  id uuid,
  name text,
  avatar_seed text,
  avatar_url text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.is_org_member(p_viewer_org_id) THEN
    RAISE EXCEPTION 'Access denied for organization %', p_viewer_org_id;
  END IF;

  IF p_viewer_org_id IS NULL OR p_target_org_id IS NULL OR p_viewer_org_id = p_target_org_id THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH viewer_peers AS (
    SELECT
      CASE
        WHEN cr.from_organization_id = p_viewer_org_id THEN cr.to_organization_id
        ELSE cr.from_organization_id
      END AS peer_org_id
    FROM public.connection_requests cr
    WHERE cr.status = 'approved'
      AND (
        cr.from_organization_id = p_viewer_org_id
        OR cr.to_organization_id = p_viewer_org_id
      )
  ),
  mutual_ids AS (
    SELECT vp.peer_org_id AS mutual_org_id
    FROM viewer_peers vp
    WHERE EXISTS (
      SELECT 1
      FROM public.connection_requests cr2
      WHERE cr2.status = 'approved'
        AND (
          (
            cr2.from_organization_id = p_target_org_id
            AND cr2.to_organization_id = vp.peer_org_id
          )
          OR (
            cr2.from_organization_id = vp.peer_org_id
            AND cr2.to_organization_id = p_target_org_id
          )
        )
    )
  )
  SELECT
    o.id,
    o.name,
    o.avatar_seed,
    COALESCE(NULLIF(TRIM(o.logo_url), ''), p.avatar_url) AS avatar_url
  FROM mutual_ids m
  JOIN public.organizations o ON o.id = m.mutual_org_id
  LEFT JOIN public.profiles p ON p.id = o.owner_id
  WHERE o.deleted_at IS NULL
  ORDER BY o.name ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_mutual_connections(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_mutual_connections(uuid, uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.get_mutual_connections(uuid, uuid) IS
  'Organizations connected to both viewer and target (approved org-to-org links). Bypasses connection_requests RLS for cross-org mutual resolution.';
