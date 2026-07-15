-- Batch version of get_connection_partner_display.
-- Returns a jsonb object keyed by org_id (text) so callers can replace N parallel
-- single-org RPC calls with one round-trip.
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
        'avatarUrl',        p.avatar_url,
        'avatarSeed',       p.avatar_seed
      )
    ),
    '{}'::jsonb
  )
  FROM public.organizations o
  JOIN public.profiles p ON p.id = o.owner_id
  WHERE o.id = ANY(p_linked_organization_ids);
$$;
