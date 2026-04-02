-- RPC for Edit Client/Supplier "Sync latest details": fetch linked org's display (name, contact, phone, email).
-- Authorization: caller must be an active member OR the owner of an org that has a client or supplier
-- with linked_organization_id = p_linked_organization_id. Single rule, no fallback. SECURITY DEFINER.

CREATE OR REPLACE FUNCTION public.get_connection_partner_display(p_linked_organization_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_my_org_id uuid;
  v_org_name text;
  v_owner_id uuid;
  v_full_name text;
  v_phone text;
  v_email text;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN NULL;
  END IF;

  -- Resolve caller's org: one that has this linked org as client or supplier, and caller is authorized
  -- (active member of that org OR owner of that org).
  SELECT c.organization_id INTO v_my_org_id
  FROM public.clients c
  JOIN public.organizations o ON o.id = c.organization_id
  WHERE c.linked_organization_id = p_linked_organization_id
    AND (
      EXISTS (
        SELECT 1 FROM public.organization_members om
        WHERE om.organization_id = c.organization_id AND om.user_id = v_uid AND om.status = 'active'
      )
      OR o.owner_id = v_uid
    )
  LIMIT 1;
  IF v_my_org_id IS NULL THEN
    SELECT s.organization_id INTO v_my_org_id
    FROM public.suppliers s
    JOIN public.organizations o ON o.id = s.organization_id
    WHERE s.linked_organization_id = p_linked_organization_id
      AND (
        EXISTS (
          SELECT 1 FROM public.organization_members om
          WHERE om.organization_id = s.organization_id AND om.user_id = v_uid AND om.status = 'active'
        )
        OR o.owner_id = v_uid
      )
    LIMIT 1;
  END IF;
  IF v_my_org_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT o.name, o.owner_id INTO v_org_name, v_owner_id
  FROM public.organizations o
  WHERE o.id = p_linked_organization_id;
  IF v_owner_id IS NULL THEN
    RETURN jsonb_build_object(
      'organizationName', coalesce(nullif(trim(v_org_name), ''), 'Connected'),
      'contactPerson', '',
      'phone', '',
      'email', ''
    );
  END IF;

  SELECT trim(coalesce(p.full_name, '')), trim(coalesce(p.phone, '')), trim(coalesce(p.email, ''))
  INTO v_full_name, v_phone, v_email
  FROM public.profiles p
  WHERE p.id = v_owner_id;

  RETURN jsonb_build_object(
    'organizationName', coalesce(nullif(trim(v_org_name), ''), 'Connected'),
    'contactPerson', coalesce(v_full_name, ''),
    'phone', coalesce(v_phone, ''),
    'email', coalesce(v_email, '')
  );
END;
$$;

COMMENT ON FUNCTION public.get_connection_partner_display(uuid) IS 'Returns linked org display (organizationName, contactPerson, phone, email) for Sync latest details. Caller must be active member or owner of an org that has a client/supplier with this linked_organization_id. SECURITY DEFINER.';
GRANT EXECUTE ON FUNCTION public.get_connection_partner_display(uuid) TO authenticated;
