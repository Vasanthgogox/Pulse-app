-- Coalesce structured client address fields into get_clients_with_profiles.address
-- so Create Trip / pickers see HQ / registered / billing when legacy address is empty.

CREATE OR REPLACE FUNCTION public.get_clients_with_profiles(p_org_id uuid)
RETURNS TABLE (
  id uuid,
  organization_id uuid,
  name text,
  contact_person text,
  phone text,
  email text,
  address text,
  gstin text,
  pan_number text,
  status text,
  created_at timestamptz,
  updated_at timestamptz,
  is_integrated boolean,
  linked_organization_id uuid,
  avatar_url text,
  avatar_seed text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    c.organization_id,
    c.name,
    c.contact_person,
    c.phone,
    c.email,
    COALESCE(
      NULLIF(TRIM(c.hq_address), ''),
      NULLIF(TRIM(c.registered_address), ''),
      NULLIF(TRIM(c.billing_address), ''),
      NULLIF(TRIM(c.address), '')
    ) AS address,
    c.gstin,
    c.pan_number,
    c.status,
    c.created_at,
    c.updated_at,
    c.is_integrated,
    c.linked_organization_id,
    COALESCE(NULLIF(TRIM(o.logo_url), ''), p.avatar_url) AS avatar_url,
    p.avatar_seed
  FROM public.clients c
  LEFT JOIN public.organizations o ON o.id = c.linked_organization_id
  LEFT JOIN public.profiles      p ON p.id = o.owner_id
  WHERE c.organization_id = p_org_id
    AND c.status = 'active'
  ORDER BY c.name ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_clients_with_profiles(uuid) TO authenticated;

COMMENT ON FUNCTION public.get_clients_with_profiles(uuid) IS
  'Active clients for an org with linked-org avatars; address coalesces hq/registered/billing/legacy.';
