-- Extend get_connection_partner_display to also return gstin, address, and website
-- so that "Sync latest details" in EditClientModal / EditSupplierModal can import
-- these fields from an integrated partner's org profile.

CREATE OR REPLACE FUNCTION public.get_connection_partner_display(p_linked_organization_id uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'organizationName', o.name,
    'contactPerson',    p.full_name,
    'phone',            p.phone,
    'email',            p.email,
    'avatarUrl',        COALESCE(NULLIF(TRIM(o.logo_url), ''), p.avatar_url),
    'avatarSeed',       p.avatar_seed,
    'gstin',            o.gstin,
    'address',          NULLIF(TRIM(
                          COALESCE(NULLIF(TRIM(o.address_line), ''), '')
                          || CASE WHEN NULLIF(TRIM(o.city),  '') IS NOT NULL THEN ', ' || TRIM(o.city)  ELSE '' END
                          || CASE WHEN NULLIF(TRIM(o.state), '') IS NOT NULL THEN ', ' || TRIM(o.state) ELSE '' END
                        ), ''),
    'website',          o.profile_website
  )
  FROM  public.organizations o
  JOIN  public.profiles p ON p.id = o.owner_id
  WHERE o.id = p_linked_organization_id;
$$;

COMMENT ON FUNCTION public.get_connection_partner_display(uuid) IS
  'Returns linked org display profile (name, contact, phone, email, avatarUrl, avatarSeed, gstin, address, website) for Sync-latest-details. SECURITY DEFINER.';

GRANT EXECUTE ON FUNCTION public.get_connection_partner_display(uuid) TO authenticated;
