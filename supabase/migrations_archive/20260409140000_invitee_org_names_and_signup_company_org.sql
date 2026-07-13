-- 1) New org name on sign-up: use company_name from metadata when set; else "{display_name}'s organization".
-- 2) get_invitee_by_phone: also return organizations.name and profiles.company_name for Add Client/Supplier prefill.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  org_id uuid;
  display_name text;
  op_model text;
  usr_role text;
  org_display_name text;
BEGIN
  display_name := coalesce(
    nullif(trim(NEW.raw_user_meta_data->>'full_name'), ''),
    split_part(coalesce(NEW.email, ''), '@', 1),
    'User'
  );
  op_model := coalesce(nullif(trim(NEW.raw_user_meta_data->>'operating_model'), ''), 'HYBRID');
  IF op_model NOT IN ('ASSET_BASED', 'NON_ASSET', 'HYBRID') THEN
    op_model := 'HYBRID';
  END IF;
  usr_role := coalesce(nullif(trim(NEW.raw_user_meta_data->>'role'), ''), 'user');

  org_display_name := coalesce(
    nullif(trim(NEW.raw_user_meta_data->>'company_name'), ''),
    display_name || '''s organization'
  );

  INSERT INTO public.organizations (name, owner_id, operating_model)
  VALUES (org_display_name, NEW.id, op_model)
  RETURNING id INTO org_id;

  INSERT INTO public.organization_members (organization_id, user_id, role, status)
  VALUES (org_id, NEW.id, 'owner', 'active');

  IF usr_role = 'driver' THEN
    INSERT INTO public.drivers (organization_id, user_id, name, phone, email, status)
    VALUES (org_id, NEW.id, display_name, nullif(trim(NEW.raw_user_meta_data->>'phone'), ''), NEW.email, 'offline');
  END IF;

  INSERT INTO public.profiles (
    id, email, full_name, role, phone, company_name, avatar_url, avatar_seed, bio, aggregated, asset
  ) VALUES (
    NEW.id,
    NEW.email,
    display_name,
    usr_role,
    nullif(trim(NEW.raw_user_meta_data->>'phone'), ''),
    nullif(trim(NEW.raw_user_meta_data->>'company_name'), ''),
    nullif(trim(NEW.raw_user_meta_data->>'avatar_url'), ''),
    nullif(trim(NEW.raw_user_meta_data->>'avatar_seed'), ''),
    nullif(trim(NEW.raw_user_meta_data->>'status_text'), ''),
    COALESCE((NEW.raw_user_meta_data->>'aggregated')::boolean, true),
    COALESCE((NEW.raw_user_meta_data->>'asset')::boolean, true)
  );

  RETURN NEW;
END;
$$;

DROP FUNCTION IF EXISTS public.get_invitee_by_phone(text);

CREATE OR REPLACE FUNCTION public.get_invitee_by_phone(p_phone text)
RETURNS TABLE(
  organization_id uuid,
  full_name text,
  phone text,
  organization_name text,
  profile_company_name text
)
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
  v_org_name text;
  v_profile_company text;
BEGIN
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
        SELECT trim(coalesce(o.name, '')) INTO v_org_name FROM public.organizations o WHERE o.id = v_org_id LIMIT 1;
        SELECT trim(coalesce(pr.company_name, '')) INTO v_profile_company FROM public.profiles pr WHERE pr.id = v_user_id LIMIT 1;
        organization_id := v_org_id;
        full_name := CASE WHEN v_name <> '' THEN v_name ELSE v_phone END;
        phone := v_phone;
        organization_name := coalesce(v_org_name, '');
        profile_company_name := nullif(v_profile_company, '');
        RETURN NEXT;
      END IF;
      RETURN;
    END IF;
  END LOOP;

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
        SELECT trim(coalesce(o.name, '')) INTO v_org_name FROM public.organizations o WHERE o.id = v_org_id LIMIT 1;
        SELECT trim(coalesce(pr.company_name, '')) INTO v_profile_company FROM public.profiles pr WHERE pr.id = v_user_id LIMIT 1;
        organization_id := v_org_id;
        full_name := CASE WHEN v_name <> '' THEN v_name ELSE v_phone END;
        phone := v_phone;
        organization_name := coalesce(v_org_name, '');
        profile_company_name := nullif(v_profile_company, '');
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
            SELECT trim(coalesce(o.name, '')) INTO v_org_name FROM public.organizations o WHERE o.id = v_org_id LIMIT 1;
            SELECT trim(coalesce(pr.company_name, '')) INTO v_profile_company FROM public.profiles pr WHERE pr.id = v_user_id LIMIT 1;
            organization_id := v_org_id;
            full_name := CASE WHEN v_name <> '' THEN v_name ELSE v_phone_elem END;
            phone := v_phone_elem;
            organization_name := coalesce(v_org_name, '');
            profile_company_name := nullif(v_profile_company, '');
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

COMMENT ON FUNCTION public.get_invitee_by_phone(text) IS
  'Network invite by phone: profiles.phone then auth metadata. Returns org id, person name, phone, organizations.name, profiles.company_name for form prefill.';

GRANT EXECUTE ON FUNCTION public.get_invitee_by_phone(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_invitee_by_phone(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_invitee_by_phone(text) TO anon;
