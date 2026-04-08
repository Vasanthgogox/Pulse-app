-- Update RPC for Edit Client/Supplier "Sync latest details": fetch linked org's display (name, contact, phone, email, avatar).
-- Authorization: caller must be an active member OR the owner of an org that has a client or supplier
-- with linked_organization_id = p_linked_organization_id. Single rule, no fallback. SECURITY DEFINER.

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
    'avatarUrl', p.avatar_url,
    'avatarSeed', p.avatar_seed
  ) INTO v_res
  FROM public.organizations o
  JOIN public.profiles p ON p.id = o.owner_id
  WHERE o.id = p_linked_organization_id;

  RETURN v_res;
END;
$$;

COMMENT ON FUNCTION public.get_connection_partner_display(uuid) IS 'Returns linked org display (organizationName, contactPerson, phone, email, avatarUrl, avatarSeed) for Sync latest details. Caller must be active member or owner of an org that has a client/supplier with this linked_organization_id. SECURITY DEFINER.';
GRANT EXECUTE ON FUNCTION public.get_connection_partner_display(uuid) TO authenticated;
