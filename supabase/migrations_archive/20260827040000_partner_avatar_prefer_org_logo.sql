-- Prefer organization branding logo over the owner's personal user avatar
-- when surfacing connection partners (clients / suppliers) in the network
-- hub list and grid cards.
--
-- Resolution priority (matches `get_connection_partner_display` from
-- `20260503120000_add_org_logo_url.sql`):
--   organizations.logo_url  →  profiles.avatar_url  →  initials/seed fallback
--
-- Why this migration:
--   The previous RPCs (`get_clients_with_profiles`, `get_suppliers_with_profiles`)
--   only returned `profiles.avatar_url` from the linked org owner. That meant
--   integrated parties whose org has a brand logo set never showed it on the
--   network hub list — users saw the owner's personal photo, or just
--   initials when neither was set.
--
-- Notes:
--   * `is_integrated` is preserved as it currently is. We don't change any
--     other column shape or order so existing TypeScript types continue to
--     line up without code changes.
--   * Empty/whitespace-only logo strings are treated as "no logo" via
--     `NULLIF(TRIM(...), '')`, otherwise an empty TEXT row would shadow a
--     perfectly good owner avatar.

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
    c.address,
    c.gstin,
    c.pan_number,
    c.status,
    c.created_at,
    c.updated_at,
    c.is_integrated,
    c.linked_organization_id,
    -- Prefer the linked org's branding logo; fall back to the owner's
    -- personal profile avatar so unbranded orgs still show a face.
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

CREATE OR REPLACE FUNCTION public.get_suppliers_with_profiles(p_org_id uuid)
RETURNS TABLE (
  id uuid,
  organization_id uuid,
  name text,
  contact text,
  company_name text,
  contact_person text,
  phone text,
  email text,
  address text,
  gst_number text,
  is_active boolean,
  is_verified boolean,
  created_at timestamptz,
  updated_at timestamptz,
  supplier_type text,
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
    s.id,
    s.organization_id,
    s.name,
    s.contact,
    s.company_name,
    s.contact_person,
    s.phone,
    s.email,
    s.address,
    s.gst_number,
    s.is_active,
    s.is_verified,
    s.created_at,
    s.updated_at,
    s.supplier_type::text,
    s.linked_organization_id,
    -- Prefer the linked org's branding logo; fall back to the owner's
    -- personal profile avatar so unbranded orgs still show a face.
    COALESCE(NULLIF(TRIM(o.logo_url), ''), p.avatar_url) AS avatar_url,
    p.avatar_seed
  FROM public.suppliers s
  LEFT JOIN public.organizations o ON o.id = s.linked_organization_id
  LEFT JOIN public.profiles      p ON p.id = o.owner_id
  WHERE s.organization_id = p_org_id
  ORDER BY s.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_suppliers_with_profiles(uuid) TO authenticated;

COMMENT ON FUNCTION public.get_clients_with_profiles(uuid) IS
  'Returns clients for an org. avatar_url resolves to organizations.logo_url first, then profiles.avatar_url from linked org owner. SECURITY DEFINER.';

COMMENT ON FUNCTION public.get_suppliers_with_profiles(uuid) IS
  'Returns suppliers for an org. avatar_url resolves to organizations.logo_url first, then profiles.avatar_url from linked org owner. SECURITY DEFINER.';
