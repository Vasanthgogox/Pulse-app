-- Returns pending driver invites sent by an org including the invitee's driver display name.
-- This avoids client-side RLS issues when the client can't read auth.users/profile fields.

CREATE OR REPLACE FUNCTION public.get_driver_invites_sent(p_org_id uuid)
RETURNS TABLE (
  id uuid,
  from_org_name text,
  driver_name text,
  status text,
  created_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    di.id,
    coalesce(nullif(trim(di.from_org_name), ''), o.name, 'Company') AS from_org_name,
    coalesce(
      nullif(trim(di.invitee_name), ''),
      nullif(trim(p.full_name), ''),
      nullif(trim(u.raw_user_meta_data->>'full_name'), ''),
      nullif(trim(u.raw_user_meta_data->>'name'), ''),
      nullif(trim(u.raw_user_meta_data->>'phone'), ''),
      nullif(trim(p.phone), ''),
      'Driver'
    ) AS driver_name,
    di.status,
    di.created_at
  FROM public.driver_invites di
  LEFT JOIN public.organizations o ON o.id = di.from_organization_id
  LEFT JOIN auth.users u ON u.id = di.to_user_id
  LEFT JOIN public.profiles p ON p.id = di.to_user_id
  WHERE di.from_organization_id = p_org_id
  ORDER BY di.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_driver_invites_sent(uuid) TO authenticated;

