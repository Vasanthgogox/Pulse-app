-- Add logo_url to organizations for org branding (separate from owner's personal avatar).
-- Priority in avatar resolution: organizations.logo_url → owner profile.avatar_url → seed/initials.

ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS logo_url text;

-- Update RPC to prefer org logo_url over owner's personal avatar_url.
CREATE OR REPLACE FUNCTION public.get_connection_partner_display(p_linked_organization_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_res jsonb;
BEGIN
  SELECT jsonb_build_object(
    'organizationName', o.name,
    'contactPerson', p.full_name,
    'phone', p.phone,
    'email', p.email,
    'avatarUrl', COALESCE(NULLIF(TRIM(o.logo_url), ''), p.avatar_url),
    'avatarSeed', p.avatar_seed
  ) INTO v_res
  FROM public.organizations o
  JOIN public.profiles p ON p.id = o.owner_id
  WHERE o.id = p_linked_organization_id;

  RETURN v_res;
END;
$$;

COMMENT ON COLUMN public.organizations.logo_url IS 'Organization branding logo (storage path or http URL). Shown instead of owner avatar in partner/linked-org displays.';
COMMENT ON FUNCTION public.get_connection_partner_display(uuid) IS 'Returns linked org display (organizationName, contactPerson, phone, email, avatarUrl=org logo or owner avatar, avatarSeed). SECURITY DEFINER.';
GRANT EXECUTE ON FUNCTION public.get_connection_partner_display(uuid) TO authenticated;
