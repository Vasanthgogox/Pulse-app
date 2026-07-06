-- Team invitation resolver: pre-signup lookup + explicit idempotent accept.
-- Removes silent auto-claim on signup; invitations are consumed only via accept RPC.

-- ── Resolver (pre-auth, after OTP on client) ─────────────────────────────────

CREATE OR REPLACE FUNCTION public.resolve_pending_team_invitations_by_phone(p_phone text)
  RETURNS TABLE(
    invitee_name          text,
    invite_id           uuid,
    organization_id     uuid,
    organization_name   text,
    invited_by_name     text,
    role                text,
    platform_role       text,
    business_unit_name  text,
    department_name     text,
    created_at          timestamptz,
    expires_at          timestamptz,
    is_expired          boolean,
    status              text
  )
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_canon text;
BEGIN
  v_canon := public.normalize_phone_canon(p_phone);
  IF v_canon IS NULL OR length(v_canon) < 10 THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    ti.invitee_name,
    ti.id,
    ti.organization_id,
    coalesce(nullif(trim(o.name), ''), 'Organization'),
    coalesce(nullif(trim(inviter.full_name), ''), 'Team admin'),
    ti.role,
    coalesce(ti.permissions->>'platformRole', ti.role),
    NULL::text,
    NULL::text,
    ti.created_at,
    ti.expires_at,
    (ti.status = 'pending' AND ti.expires_at <= now()) AS is_expired,
    ti.status
  FROM public.organization_team_invites ti
  JOIN public.organizations o ON o.id = ti.organization_id
  LEFT JOIN public.profiles inviter ON inviter.id = ti.invited_by
  WHERE ti.invitee_phone_canon = v_canon
    AND ti.status IN ('pending', 'expired')
  ORDER BY
    CASE WHEN ti.status = 'pending' AND ti.expires_at > now() THEN 0 ELSE 1 END,
    ti.created_at DESC;
END;
$$;

COMMENT ON FUNCTION public.resolve_pending_team_invitations_by_phone(text) IS
  'Invitation resolver: list pending/expired phone invites for onboarding (post-OTP).';

GRANT EXECUTE ON FUNCTION public.resolve_pending_team_invitations_by_phone(text)
  TO anon, authenticated;

-- ── Idempotent accept (post signUp + session) ───────────────────────────────

CREATE OR REPLACE FUNCTION public.accept_pending_team_invitation(p_invite_id uuid)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_uid         uuid := auth.uid();
  v_inv         public.organization_team_invites%ROWTYPE;
  v_profile     public.profiles%ROWTYPE;
  v_member_id   uuid;
  v_canon       text;
  v_existing    public.organization_members%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_inv
  FROM public.organization_team_invites
  WHERE id = p_invite_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invitation not found';
  END IF;

  IF v_inv.status = 'accepted' THEN
    SELECT om.id INTO v_member_id
    FROM public.organization_members om
    WHERE om.organization_id = v_inv.organization_id
      AND om.user_id = v_uid
      AND om.status IN ('active', 'invited')
    LIMIT 1;
    RETURN jsonb_build_object(
      'organization_id', v_inv.organization_id,
      'membership_id', v_member_id,
      'already_accepted', true
    );
  END IF;

  IF v_inv.status <> 'pending' THEN
    RAISE EXCEPTION 'Invitation is no longer valid';
  END IF;

  IF v_inv.expires_at <= now() THEN
    UPDATE public.organization_team_invites
    SET status = 'expired', updated_at = now()
    WHERE id = v_inv.id;
    RAISE EXCEPTION 'Invitation has expired';
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = v_uid;
  v_canon := public.normalize_phone_canon(v_profile.phone);
  IF v_canon IS NULL OR v_canon <> v_inv.invitee_phone_canon THEN
    RAISE EXCEPTION 'Phone number does not match this invitation';
  END IF;

  SELECT * INTO v_existing
  FROM public.organization_members
  WHERE organization_id = v_inv.organization_id
    AND user_id = v_uid;

  IF FOUND THEN
    IF v_existing.status = 'active' THEN
      UPDATE public.organization_team_invites
      SET status = 'accepted', accepted_user_id = v_uid, updated_at = now()
      WHERE id = v_inv.id;
      RETURN jsonb_build_object(
        'organization_id', v_inv.organization_id,
        'membership_id', v_existing.id,
        'already_member', true
      );
    END IF;

    UPDATE public.organization_members
    SET
      role        = v_inv.role,
      permissions = v_inv.permissions,
      status      = 'active',
      joined_at   = now()
    WHERE id = v_existing.id
    RETURNING id INTO v_member_id;
  ELSE
    INSERT INTO public.organization_members (
      organization_id, user_id, role, status, permissions, joined_at
    ) VALUES (
      v_inv.organization_id,
      v_uid,
      v_inv.role,
      'active',
      v_inv.permissions,
      now()
    )
    RETURNING id INTO v_member_id;
  END IF;

  UPDATE public.organization_team_invites
  SET
    status           = 'accepted',
    accepted_user_id = v_uid,
    updated_at       = now()
  WHERE id = v_inv.id;

  RETURN jsonb_build_object(
    'organization_id', v_inv.organization_id,
    'membership_id', v_member_id,
    'already_member', false
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_pending_team_invitation(uuid) TO authenticated;

-- ── Mark expired invites (housekeeping from resolver) ───────────────────────

CREATE OR REPLACE FUNCTION public.expire_stale_team_invitations(p_phone text)
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_canon text;
  v_count integer;
BEGIN
  v_canon := public.normalize_phone_canon(p_phone);
  UPDATE public.organization_team_invites
  SET status = 'expired', updated_at = now()
  WHERE invitee_phone_canon = v_canon
    AND status = 'pending'
    AND expires_at <= now();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.expire_stale_team_invitations(text) TO anon, authenticated;

-- ── handle_new_user: no silent invite claim; honor skip_org_creation only ─────

CREATE OR REPLACE FUNCTION public.handle_new_user()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  r                  text    := COALESCE(NULLIF(TRIM(NEW.raw_user_meta_data->>'role'), ''), 'user');
  skip_org           boolean := COALESCE((NEW.raw_user_meta_data->>'skip_org_creation')::boolean, false);
  org_id             uuid;
  org_name           text;
  profile_exists     boolean;
  org_exists         boolean;
  membership_exists  boolean;
  display_name       text;
  signup_phone       text;
BEGIN
  display_name := COALESCE(
    NULLIF(TRIM(NEW.raw_user_meta_data->>'full_name'), ''),
    NULLIF(TRIM(NEW.raw_user_meta_data->>'name'), ''),
    NULLIF(SPLIT_PART(NEW.email, '@', 1), ''),
    'User'
  );

  signup_phone := NULLIF(TRIM(NEW.raw_user_meta_data->>'phone'), '');

  INSERT INTO public.users (id, name)
  VALUES (NEW.id, display_name)
  ON CONFLICT (id) DO NOTHING;

  SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id = NEW.id) INTO profile_exists;
  IF NOT profile_exists THEN
    INSERT INTO public.profiles (id, email, full_name, role, aggregated, asset, company_name, phone)
    VALUES (
      NEW.id,
      NEW.email,
      display_name,
      CASE WHEN r IN ('user','driver') THEN r ELSE 'user' END,
      CASE WHEN r = 'driver' THEN false ELSE COALESCE((NEW.raw_user_meta_data->>'aggregated')::boolean, true) END,
      CASE WHEN r = 'driver' THEN false ELSE COALESCE((NEW.raw_user_meta_data->>'asset')::boolean, true) END,
      NULLIF(TRIM(NEW.raw_user_meta_data->>'company_name'), ''),
      signup_phone
    )
    ON CONFLICT (id) DO NOTHING;
    RAISE LOG 'handle_new_user: profile created for user % (role %)', NEW.id, r;
  END IF;

  IF r = 'user' AND NOT skip_org THEN
    SELECT id INTO org_id FROM public.organizations WHERE owner_id = NEW.id LIMIT 1;
    org_exists := (org_id IS NOT NULL);

    IF NOT org_exists THEN
      org_name := COALESCE(
        NULLIF(TRIM(NEW.raw_user_meta_data->>'company_name'), ''),
        display_name || '''s Organization'
      );
      INSERT INTO public.organizations (
        owner_id, name, operating_model,
        address_line, locality, pincode, city, state, zone,
        business_type, employee_count
      ) VALUES (
        NEW.id,
        org_name,
        COALESCE(NULLIF(TRIM(NEW.raw_user_meta_data->>'operating_model'), ''), 'HYBRID'),
        NULLIF(TRIM(NEW.raw_user_meta_data->>'address_line'), ''),
        NULLIF(TRIM(NEW.raw_user_meta_data->>'locality'), ''),
        NULLIF(REGEXP_REPLACE(COALESCE(NEW.raw_user_meta_data->>'pincode', ''), '\D', '', 'g'), ''),
        NULLIF(TRIM(NEW.raw_user_meta_data->>'city'), ''),
        NULLIF(TRIM(NEW.raw_user_meta_data->>'state'), ''),
        NULLIF(TRIM(NEW.raw_user_meta_data->>'zone'), ''),
        NULLIF(TRIM(NEW.raw_user_meta_data->>'business_type'), ''),
        NULLIF(TRIM(NEW.raw_user_meta_data->>'employee_count'), '')
      )
      RETURNING id INTO org_id;

      IF org_id IS NULL THEN
        RAISE EXCEPTION 'handle_new_user: organizations insert did not return id for user %', NEW.id;
      END IF;
      RAISE LOG 'handle_new_user: organization created % for user %', org_id, NEW.id;
    END IF;

    SELECT EXISTS(
      SELECT 1 FROM public.organization_members
      WHERE organization_id = org_id AND user_id = NEW.id
    ) INTO membership_exists;

    IF NOT membership_exists THEN
      INSERT INTO public.organization_members (organization_id, user_id, role, status)
      VALUES (org_id, NEW.id, 'owner', 'active')
      ON CONFLICT (organization_id, user_id) DO UPDATE SET status = 'active', role = 'owner';
      RAISE LOG 'handle_new_user: membership created for user % in org %', NEW.id, org_id;
    END IF;
  END IF;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE LOG 'handle_new_user FAILED for user % (email %): %', NEW.id, NEW.email, SQLERRM;
    RAISE;
END;
$$;
