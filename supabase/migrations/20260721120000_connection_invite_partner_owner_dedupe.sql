-- Connection invites: expose partner owner_id via SECURITY DEFINER (RLS blocks direct
-- organizations SELECT for invitee orgs). Used for duplicate-contact dedupe + blocking.

CREATE OR REPLACE FUNCTION public.get_connection_partner_display_batch(
  p_linked_organization_ids uuid[]
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT coalesce(
    jsonb_object_agg(
      o.id::text,
      jsonb_build_object(
        'organizationName', o.name,
        'contactPerson',    p.full_name,
        'phone',            p.phone,
        'email',            p.email,
        'avatarUrl',        COALESCE(NULLIF(TRIM(o.logo_url), ''), p.avatar_url),
        'avatarSeed',       p.avatar_seed,
        'ownerId',          o.owner_id
      )
    ),
    '{}'::jsonb
  )
  FROM public.organizations o
  JOIN public.profiles p ON p.id = o.owner_id
  WHERE o.id = ANY(p_linked_organization_ids);
$$;

COMMENT ON FUNCTION public.get_connection_partner_display_batch(uuid[]) IS
  'Batch partner display for connection invites. Includes ownerId for duplicate-contact detection. SECURITY DEFINER.';

-- Pending invite to any org owned by the same user as p_to_org_id (duplicate org shells).
CREATE OR REPLACE FUNCTION public.find_pending_sent_connection_to_partner_owner(
  p_from_org_id uuid,
  p_to_org_id uuid
)
RETURNS TABLE(request_id uuid, same_pair boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT cr.id AS request_id,
         (cr.to_organization_id = p_to_org_id) AS same_pair
  FROM public.connection_requests cr
  JOIN public.organizations to_org ON to_org.id = cr.to_organization_id
  JOIN public.organizations target ON target.id = p_to_org_id
  WHERE cr.from_organization_id = p_from_org_id
    AND cr.status = 'pending'
    AND target.owner_id IS NOT NULL
    AND to_org.owner_id = target.owner_id
    AND EXISTS (
      SELECT 1
      FROM public.organization_members om
      WHERE om.organization_id = p_from_org_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
    )
  ORDER BY cr.created_at DESC
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.find_pending_sent_connection_to_partner_owner(uuid, uuid) IS
  'Returns an existing pending sent connection request to the same partner owner (if any). Caller must be active member of p_from_org_id.';

GRANT EXECUTE ON FUNCTION public.find_pending_sent_connection_to_partner_owner(uuid, uuid) TO authenticated;

-- Recall all pending sent invites to orgs owned by the same partner user.
CREATE OR REPLACE FUNCTION public.cancel_pending_sent_connections_to_partner_owner(
  p_from_org_id uuid,
  p_partner_owner_id uuid
)
RETURNS uuid[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_ids uuid[];
BEGIN
  WITH deleted AS (
    DELETE FROM public.connection_requests cr
    USING public.organizations o
    WHERE cr.from_organization_id = p_from_org_id
      AND cr.status = 'pending'
      AND cr.to_organization_id = o.id
      AND o.owner_id = p_partner_owner_id
      AND EXISTS (
        SELECT 1
        FROM public.organization_members om
        WHERE om.organization_id = p_from_org_id
          AND om.user_id = auth.uid()
          AND om.status = 'active'
      )
    RETURNING cr.id
  )
  SELECT coalesce(array_agg(id), '{}'::uuid[]) INTO v_ids FROM deleted;

  RETURN v_ids;
END;
$$;

COMMENT ON FUNCTION public.cancel_pending_sent_connections_to_partner_owner(uuid, uuid) IS
  'Deletes all pending sent connection_requests from p_from_org_id to orgs owned by p_partner_owner_id.';

GRANT EXECUTE ON FUNCTION public.cancel_pending_sent_connections_to_partner_owner(uuid, uuid) TO authenticated;
