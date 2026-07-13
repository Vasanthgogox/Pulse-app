-- Production RPCs for Network Architecture: edit forms read COALESCE(linked_org_profile, local_row).
-- Integrated: contact data lives in the linked org's owner profile; local row may have only linkage.
-- These RPCs return a single row with display fields merged from linked profile when applicable.

-- 1) get_supplier_details(p_supplier_id) — for supplier detail/edit; integrated => linked org profile
CREATE OR REPLACE FUNCTION public.get_supplier_details(p_supplier_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_row record;
  v_org_name text;
  v_owner_id uuid;
  v_full_name text;
  v_phone text;
  v_email text;
  v_authorized boolean;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT s.id, s.organization_id, s.name, s.contact, s.company_name, s.contact_person,
         s.phone, s.email, s.address, s.gst_number, s.is_active, s.is_verified,
         s.operating_areas, s.vehicle_types, s.supplier_type, s.linked_organization_id,
         s.created_at, s.updated_at
  INTO v_row
  FROM public.suppliers s
  WHERE s.id = p_supplier_id;

  IF v_row.id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Caller must be active member or owner of the supplier's org
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = v_row.organization_id AND om.user_id = v_uid AND om.status = 'active'
  ) OR EXISTS (
    SELECT 1 FROM public.organizations o
    WHERE o.id = v_row.organization_id AND o.owner_id = v_uid
  ) INTO v_authorized;

  IF NOT v_authorized THEN
    RETURN NULL;
  END IF;

  -- Integrated: merge display from linked org's owner profile
  IF v_row.supplier_type = 'integrated' AND v_row.linked_organization_id IS NOT NULL THEN
    SELECT o.name, o.owner_id INTO v_org_name, v_owner_id
    FROM public.organizations o
    WHERE o.id = v_row.linked_organization_id;

    IF v_owner_id IS NOT NULL THEN
      SELECT trim(coalesce(p.full_name, '')), trim(coalesce(p.phone, '')), trim(coalesce(p.email, ''))
      INTO v_full_name, v_phone, v_email
      FROM public.profiles p
      WHERE p.id = v_owner_id;
    END IF;

    RETURN jsonb_build_object(
      'id', v_row.id,
      'organization_id', v_row.organization_id,
      'name', coalesce(nullif(trim(v_row.name), ''), nullif(trim(v_org_name), ''), v_row.company_name),
      'contact', coalesce(nullif(trim(v_row.contact), ''), v_full_name),
      'company_name', coalesce(nullif(trim(v_row.company_name), ''), nullif(trim(v_org_name), ''), 'Connected'),
      'contact_person', coalesce(nullif(trim(v_row.contact_person), ''), v_full_name),
      'phone', coalesce(nullif(trim(v_row.phone), ''), v_phone),
      'email', coalesce(nullif(trim(v_row.email), ''), v_email),
      'address', v_row.address,
      'gst_number', v_row.gst_number,
      'is_active', v_row.is_active,
      'is_verified', v_row.is_verified,
      'operating_areas', v_row.operating_areas,
      'vehicle_types', v_row.vehicle_types,
      'supplier_type', v_row.supplier_type,
      'linked_organization_id', v_row.linked_organization_id,
      'created_at', v_row.created_at,
      'updated_at', v_row.updated_at
    );
  END IF;

  -- Non-integrated: return local row as-is
  RETURN to_jsonb(v_row);
END;
$$;

COMMENT ON FUNCTION public.get_supplier_details(uuid) IS 'Returns supplier row for detail/edit. When supplier_type=integrated, name/company_name/contact_person/phone/email are COALESCE from linked org owner profile. Caller must be member or owner of supplier.organization_id.';

-- 2) get_client_details(p_client_id) — for client detail/edit; integrated => linked org profile
CREATE OR REPLACE FUNCTION public.get_client_details(p_client_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_row record;
  v_org_name text;
  v_owner_id uuid;
  v_full_name text;
  v_phone text;
  v_email text;
  v_authorized boolean;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT c.id, c.organization_id, c.name, c.contact_person, c.phone, c.email, c.address,
         c.gstin, c.pan_number, c.status, c.notes, c.is_integrated, c.linked_organization_id,
         c.created_by, c.created_at, c.updated_at, c.display_id
  INTO v_row
  FROM public.clients c
  WHERE c.id = p_client_id;

  IF v_row.id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Caller must be active member or owner of the client's org
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = v_row.organization_id AND om.user_id = v_uid AND om.status = 'active'
  ) OR EXISTS (
    SELECT 1 FROM public.organizations o
    WHERE o.id = v_row.organization_id AND o.owner_id = v_uid
  ) INTO v_authorized;

  IF NOT v_authorized THEN
    RETURN NULL;
  END IF;

  -- Integrated (linked_organization_id set): merge display from linked org's owner profile
  IF v_row.linked_organization_id IS NOT NULL THEN
    SELECT o.name, o.owner_id INTO v_org_name, v_owner_id
    FROM public.organizations o
    WHERE o.id = v_row.linked_organization_id;

    IF v_owner_id IS NOT NULL THEN
      SELECT trim(coalesce(p.full_name, '')), trim(coalesce(p.phone, '')), trim(coalesce(p.email, ''))
      INTO v_full_name, v_phone, v_email
      FROM public.profiles p
      WHERE p.id = v_owner_id;
    END IF;

    RETURN jsonb_build_object(
      'id', v_row.id,
      'organization_id', v_row.organization_id,
      'name', coalesce(nullif(trim(v_row.name), ''), nullif(trim(v_org_name), ''), 'Client'),
      'contact_person', coalesce(nullif(trim(v_row.contact_person), ''), v_full_name),
      'phone', coalesce(nullif(trim(v_row.phone), ''), v_phone),
      'email', coalesce(nullif(trim(v_row.email), ''), v_email),
      'address', v_row.address,
      'gstin', v_row.gstin,
      'pan_number', v_row.pan_number,
      'status', v_row.status,
      'notes', v_row.notes,
      'is_integrated', v_row.is_integrated,
      'linked_organization_id', v_row.linked_organization_id,
      'created_by', v_row.created_by,
      'created_at', v_row.created_at,
      'updated_at', v_row.updated_at,
      'display_id', v_row.display_id
    );
  END IF;

  -- Non-integrated: return local row as-is
  RETURN to_jsonb(v_row);
END;
$$;

COMMENT ON FUNCTION public.get_client_details(uuid) IS 'Returns client row for detail/edit. When linked_organization_id is set, name/contact_person/phone/email are COALESCE from linked org owner profile. Caller must be member or owner of client.organization_id.';

GRANT EXECUTE ON FUNCTION public.get_supplier_details(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_client_details(uuid) TO authenticated;
