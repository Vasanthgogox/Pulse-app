-- Same-org active members must be invisible to invitee lookup.
--
-- Both RPCs previously checked only that the caller belonged to SOME org, never
-- comparing the resolved target org to the caller's. Any member could surface a
-- colleague (including the owner) as a connectable external organization.
--
-- Caller org is passed in and validated with is_org_member(), mirroring
-- discover_organizations. A singular "SELECT organization_id INTO v_caller_org"
-- would be wrong: UNIQUE(organization_id, user_id) permits multi-org users, so
-- only the caller's ACTIVE WORKSPACE org is excluded, not every org they belong to.
--
-- Scope is status='active' (via is_org_member semantics): former/inactive members
-- remain legitimately addable as external parties.

CREATE OR REPLACE FUNCTION public.get_invitee_by_phone(
  p_phone text,
  p_org_id uuid
)
 RETURNS TABLE(organization_id uuid, full_name text, phone text, organization_name text, profile_company_name text, profile_role text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_uid uuid;
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
  v_profile_role text;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Caller must be an ACTIVE member of the workspace org they claim to act for.
  IF p_org_id IS NULL OR NOT public.is_org_member(p_org_id) THEN
    RAISE EXCEPTION 'Access denied for organization %', p_org_id;
  END IF;

  PERFORM public.enforce_rpc_rate_limit('get_invitee_by_phone', 10, interval '1 minute');

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

  FOR v_user_id, v_name, v_phone, v_profile_role IN
    SELECT
      pr.id,
      trim(coalesce(pr.full_name, '')),
      trim(coalesce(pr.phone, '')),
      lower(trim(coalesce(pr.role, '')))
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
      -- Active member of the caller's workspace org → invisible.
      IF EXISTS (
        SELECT 1 FROM public.organization_members om
        WHERE om.user_id = v_user_id
          AND om.organization_id = p_org_id
          AND om.status = 'active'
      ) THEN
        RETURN;
      END IF;

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
      IF v_org_id IS NOT NULL AND v_org_id <> p_org_id THEN
        SELECT trim(coalesce(o.name, '')) INTO v_org_name FROM public.organizations o WHERE o.id = v_org_id LIMIT 1;
        SELECT trim(coalesce(pr.company_name, '')) INTO v_profile_company FROM public.profiles pr WHERE pr.id = v_user_id LIMIT 1;
        organization_id := v_org_id;
        full_name := CASE WHEN v_name <> '' THEN v_name ELSE v_phone END;
        phone := v_phone;
        organization_name := coalesce(v_org_name, '');
        profile_company_name := nullif(v_profile_company, '');
        profile_role := coalesce(nullif(v_profile_role, ''), '');
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
      IF EXISTS (
        SELECT 1 FROM public.organization_members om
        WHERE om.user_id = v_user_id
          AND om.organization_id = p_org_id
          AND om.status = 'active'
      ) THEN
        RETURN;
      END IF;

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
      IF v_org_id IS NOT NULL AND v_org_id <> p_org_id THEN
        SELECT trim(coalesce(o.name, '')) INTO v_org_name FROM public.organizations o WHERE o.id = v_org_id LIMIT 1;
        SELECT
          trim(coalesce(pr.company_name, '')),
          lower(trim(coalesce(pr.role, '')))
        INTO v_profile_company, v_profile_role
        FROM public.profiles pr
        WHERE pr.id = v_user_id
        LIMIT 1;
        organization_id := v_org_id;
        full_name := CASE WHEN v_name <> '' THEN v_name ELSE v_phone END;
        phone := v_phone;
        organization_name := coalesce(v_org_name, '');
        profile_company_name := nullif(v_profile_company, '');
        profile_role := coalesce(nullif(v_profile_role, ''), '');
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
          IF EXISTS (
            SELECT 1 FROM public.organization_members om
            WHERE om.user_id = v_user_id
              AND om.organization_id = p_org_id
              AND om.status = 'active'
          ) THEN
            RETURN;
          END IF;

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
          IF v_org_id IS NOT NULL AND v_org_id <> p_org_id THEN
            SELECT trim(coalesce(o.name, '')) INTO v_org_name FROM public.organizations o WHERE o.id = v_org_id LIMIT 1;
            SELECT
              trim(coalesce(pr.company_name, '')),
              lower(trim(coalesce(pr.role, '')))
            INTO v_profile_company, v_profile_role
            FROM public.profiles pr
            WHERE pr.id = v_user_id
            LIMIT 1;
            organization_id := v_org_id;
            full_name := CASE WHEN v_name <> '' THEN v_name ELSE v_phone_elem END;
            phone := v_phone_elem;
            organization_name := coalesce(v_org_name, '');
            profile_company_name := nullif(v_profile_company, '');
            profile_role := coalesce(nullif(v_profile_role, ''), '');
            RETURN NEXT;
          END IF;
          RETURN;
        END IF;
      END LOOP;
    END IF;
  END LOOP;

  RETURN;
END;
$function$;