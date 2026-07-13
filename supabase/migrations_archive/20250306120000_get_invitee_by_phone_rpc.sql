-- Connection invite by phone: PRIMARY = profiles.phone (profile phone number), FALLBACK = auth.users.raw_user_meta_data.
-- Network request search uses profile's phone first, then auth. Org from organization_members or organizations.owner_id.

CREATE OR REPLACE FUNCTION public.get_invitee_by_phone(p_phone text)
RETURNS TABLE(organization_id uuid, full_name text, phone text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id uuid;
  v_org_id uuid;
  v_name text;
  v_phone text;
  v_normalized text;
  v_stored_normalized text;
  v_meta jsonb;
  v_phone_elem text;
BEGIN
  -- Normalize input: digits only, last 10 for Indian mobile
  v_normalized := regexp_replace(coalesce(trim(p_phone), ''), '\s+', '', 'g');
  v_normalized := regexp_replace(v_normalized, '\D', '', 'g');
  IF length(v_normalized) >= 12 AND left(v_normalized, 2) = '91' THEN
    v_normalized := right(v_normalized, 10);
  ELSIF length(v_normalized) >= 10 THEN
    v_normalized := right(v_normalized, 10);
  END IF;
  IF v_normalized = '' THEN
    RETURN;
  END IF;

  -- PRIMARY: search by profiles.phone (profile phone number) for network request list
  FOR v_user_id, v_name, v_phone IN
    SELECT pr.id, trim(coalesce(pr.full_name, '')), trim(coalesce(pr.phone, ''))
    FROM public.profiles pr
    WHERE pr.phone IS NOT NULL AND trim(pr.phone) <> ''
  LOOP
    v_stored_normalized := regexp_replace(regexp_replace(v_phone, '\s+', '', 'g'), '\D', '', 'g');
    IF length(v_stored_normalized) >= 12 AND left(v_stored_normalized, 2) = '91' THEN
      v_stored_normalized := right(v_stored_normalized, 10);
    ELSIF length(v_stored_normalized) >= 10 THEN
      v_stored_normalized := right(v_stored_normalized, 10);
    END IF;
    IF v_stored_normalized = v_normalized THEN
      v_org_id := NULL;
      SELECT om.organization_id INTO v_org_id
      FROM public.organization_members om
      WHERE om.user_id = v_user_id AND om.status = 'active'
      LIMIT 1;
      IF v_org_id IS NULL THEN
        SELECT o.id INTO v_org_id
        FROM public.organizations o
        WHERE o.owner_id = v_user_id
        LIMIT 1;
      END IF;
      IF v_org_id IS NOT NULL THEN
        organization_id := v_org_id;
        full_name       := CASE WHEN v_name <> '' THEN v_name ELSE v_phone END;
        phone           := v_phone;
        RETURN NEXT;
      END IF;
      RETURN;
    END IF;
  END LOOP;

  -- FALLBACK: auth.users.raw_user_meta_data (single phone or phone_numbers array)
  FOR v_user_id, v_meta IN
    SELECT u.id, u.raw_user_meta_data
    FROM auth.users u
    WHERE u.raw_user_meta_data IS NOT NULL
  LOOP
    v_name := trim(coalesce(v_meta->>'full_name', v_meta->>'name', ''));
    v_phone := trim(coalesce(v_meta->>'phone', ''));

    v_stored_normalized := regexp_replace(regexp_replace(v_phone, '\s+', '', 'g'), '\D', '', 'g');
    IF length(v_stored_normalized) >= 10 THEN v_stored_normalized := right(v_stored_normalized, 10); END IF;
    IF v_stored_normalized = v_normalized THEN
      v_org_id := NULL;
      SELECT om.organization_id INTO v_org_id
      FROM public.organization_members om
      WHERE om.user_id = v_user_id AND om.status = 'active'
      LIMIT 1;
      IF v_org_id IS NULL THEN
        SELECT o.id INTO v_org_id
        FROM public.organizations o
        WHERE o.owner_id = v_user_id
        LIMIT 1;
      END IF;
      IF v_org_id IS NOT NULL THEN
        organization_id := v_org_id;
        full_name       := CASE WHEN v_name <> '' THEN v_name ELSE v_phone END;
        phone           := v_phone;
        RETURN NEXT;
      END IF;
      RETURN;
    END IF;

    IF jsonb_typeof(v_meta->'phone_numbers') = 'array' THEN
      FOR v_phone_elem IN SELECT jsonb_array_elements_text(v_meta->'phone_numbers')
      LOOP
        v_stored_normalized := regexp_replace(regexp_replace(trim(v_phone_elem), '\s+', '', 'g'), '\D', '', 'g');
        IF length(v_stored_normalized) >= 10 THEN v_stored_normalized := right(v_stored_normalized, 10); END IF;
        IF v_stored_normalized = v_normalized THEN
          v_org_id := NULL;
          SELECT om.organization_id INTO v_org_id
          FROM public.organization_members om
          WHERE om.user_id = v_user_id AND om.status = 'active'
          LIMIT 1;
          IF v_org_id IS NULL THEN
            SELECT o.id INTO v_org_id
            FROM public.organizations o
            WHERE o.owner_id = v_user_id
            LIMIT 1;
          END IF;
          IF v_org_id IS NOT NULL THEN
            organization_id := v_org_id;
            full_name       := CASE WHEN v_name <> '' THEN v_name ELSE v_phone_elem END;
            phone           := v_phone_elem;
            RETURN NEXT;
          END IF;
          RETURN;
        END IF;
      END LOOP;
    END IF;
  END LOOP;
  RETURN;
END;
$$;

COMMENT ON FUNCTION public.get_invitee_by_phone(text) IS 'Network request invite by phone: PRIMARY = profiles.phone, FALLBACK = auth.users.raw_user_meta_data. Returns org id and display name.';

GRANT EXECUTE ON FUNCTION public.get_invitee_by_phone(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_invitee_by_phone(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_invitee_by_phone(text) TO anon;
