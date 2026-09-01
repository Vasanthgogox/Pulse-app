-- A user with an active/pending membership in ANY org must not be invited
-- into a different org. Previously, matching an existing Pulse account by
-- phone/email routed straight to "invite_existing_user" regardless of their
-- membership elsewhere, silently attaching them to a second org with no
-- error surfaced (e.g. amilthan.g@gogox.com invited into GOGOVAN INDIA PVT
-- LTD while already pending/active in another org).

CREATE OR REPLACE FUNCTION public.precheck_team_invite_contact(
  p_org_id uuid,
  p_phone  text,
  p_email  text DEFAULT NULL
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_canon       text;
  v_email       text := nullif(lower(trim(coalesce(p_email, ''))), '');
  v_user_id     uuid;
  v_user_phone  text;
  v_user_email  text;
  v_user_name   text;
  v_target      text := 'none';
  v_other_orgs  jsonb := '[]'::jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.is_org_member(p_org_id) THEN
    RAISE EXCEPTION 'Not a member of this organization';
  END IF;

  v_canon := public.normalize_phone_canon(p_phone);

  -- Resolve user by phone first
  IF v_canon IS NOT NULL AND length(v_canon) >= 10 THEN
    SELECT p.id, p.phone, p.email, p.full_name
    INTO v_user_id, v_user_phone, v_user_email, v_user_name
    FROM public.profiles p
    WHERE public.normalize_phone_canon(p.phone) = v_canon
    LIMIT 1;
  END IF;

  -- Resolve user by email if phone miss
  IF v_user_id IS NULL AND v_email IS NOT NULL THEN
    SELECT p.id, p.phone, p.email, p.full_name
    INTO v_user_id, v_user_phone, v_user_email, v_user_name
    FROM public.profiles p
    WHERE lower(trim(p.email)) = v_email
    LIMIT 1;
  END IF;

  IF v_user_id IS NOT NULL THEN
    SELECT om.status INTO v_target
    FROM public.organization_members om
    WHERE om.organization_id = p_org_id AND om.user_id = v_user_id
    LIMIT 1;

    SELECT coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'name', coalesce(o.name, 'Organization'))), '[]'::jsonb)
    INTO v_other_orgs
    FROM public.organization_members om
    JOIN public.organizations o ON o.id = om.organization_id
    WHERE om.user_id = v_user_id
      AND om.organization_id <> p_org_id
      AND om.status IN ('active', 'pending');

    IF v_target = 'active' THEN
      RETURN jsonb_build_object(
        'recommended_action', 'already_member',
        'user_id', v_user_id,
        'user_name', v_user_name,
        'user_email', v_user_email,
        'user_phone', v_user_phone,
        'other_orgs', v_other_orgs
      );
    END IF;

    IF v_target = 'invited' THEN
      RETURN jsonb_build_object(
        'recommended_action', 'already_invited',
        'user_id', v_user_id,
        'user_name', v_user_name,
        'user_email', v_user_email,
        'user_phone', v_user_phone,
        'other_orgs', v_other_orgs
      );
    END IF;

    -- Belongs to a different org already (active or pending there) — block.
    IF jsonb_array_length(v_other_orgs) > 0 THEN
      RETURN jsonb_build_object(
        'recommended_action', 'belongs_to_other_org',
        'user_id', v_user_id,
        'user_name', v_user_name,
        'user_email', v_user_email,
        'user_phone', v_user_phone,
        'other_orgs', v_other_orgs,
        'message', 'This person already belongs to another organization on Pulse and cannot be added here.'
      );
    END IF;

    RETURN jsonb_build_object(
      'recommended_action', 'invite_existing_user',
      'user_id', v_user_id,
      'user_name', v_user_name,
      'user_email', v_user_email,
      'user_phone', v_user_phone,
      'other_orgs', v_other_orgs,
      'phone_matches_invite',
      v_canon IS NOT NULL AND public.normalize_phone_canon(v_user_phone) = v_canon
    );
  END IF;

  -- No Pulse account — but email must not already be taken (stale phone on profile edge case)
  IF v_email IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM auth.users u WHERE lower(trim(u.email)) = v_email
    ) OR EXISTS (
      SELECT 1 FROM public.profiles p WHERE lower(trim(p.email)) = v_email
    ) THEN
      RETURN jsonb_build_object(
        'recommended_action', 'email_registered',
        'message', 'This email already has a Pulse account. Invite by signing them in, not as a new signup.'
      );
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'recommended_action', 'pending_invite',
    'other_orgs', '[]'::jsonb
  );
END;
$$;

-- ── Enforce the same guard server-side on the phone-invite RPC ─────────────
-- (defense in depth: blocks a client that skips the precheck call)

CREATE OR REPLACE FUNCTION public.create_team_invite_pending(
  p_org_id    uuid,
  p_phone     text,
  p_name      text,
  p_email     text DEFAULT NULL,
  p_role      text DEFAULT 'member',
  p_permissions jsonb DEFAULT '{}'::jsonb
)
  RETURNS public.organization_team_invites
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_canon      text;
  v_email      text := nullif(lower(trim(coalesce(p_email, ''))), '');
  v_row        public.organization_team_invites;
  v_uid        uuid := auth.uid();
  v_existing_user_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = p_org_id
      AND om.user_id = v_uid
      AND om.role IN ('owner', 'admin')
      AND om.status = 'active'
  ) THEN
    RAISE EXCEPTION 'Only active org admins can invite team members';
  END IF;

  v_canon := public.normalize_phone_canon(p_phone);
  IF v_canon IS NULL OR length(v_canon) < 10 THEN
    RAISE EXCEPTION 'Enter a valid 10-digit mobile number';
  END IF;

  IF trim(coalesce(p_name, '')) = '' THEN
    RAISE EXCEPTION 'Employee name is required';
  END IF;

  SELECT p.id INTO v_existing_user_id
  FROM public.profiles p
  WHERE public.normalize_phone_canon(p.phone) = v_canon
  LIMIT 1;

  IF v_existing_user_id IS NULL AND v_email IS NOT NULL THEN
    SELECT p.id INTO v_existing_user_id
    FROM public.profiles p
    WHERE lower(trim(p.email)) = v_email
    LIMIT 1;
  END IF;

  IF v_existing_user_id IS NOT NULL THEN
    RAISE EXCEPTION 'This person already has a Pulse account — invite them as an existing user';
  END IF;

  IF v_email IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM auth.users u WHERE lower(trim(u.email)) = v_email)
       OR EXISTS (SELECT 1 FROM public.profiles p WHERE lower(trim(p.email)) = v_email) THEN
      RAISE EXCEPTION 'This email already has a Pulse account — use Invite existing user (sign-in path), not Awaiting Signup';
    END IF;
  END IF;

  INSERT INTO public.organization_team_invites (
    organization_id,
    invited_by,
    invitee_name,
    invitee_phone,
    invitee_phone_canon,
    invitee_email,
    role,
    permissions
  ) VALUES (
    p_org_id,
    v_uid,
    trim(p_name),
    trim(p_phone),
    v_canon,
    nullif(trim(coalesce(p_email, '')), ''),
    coalesce(nullif(trim(p_role), ''), 'member'),
    coalesce(p_permissions, '{}'::jsonb)
  )
  ON CONFLICT (organization_id, invitee_phone_canon)
    WHERE status = 'pending'
  DO UPDATE SET
    invitee_name  = EXCLUDED.invitee_name,
    invitee_email = EXCLUDED.invitee_email,
    role          = EXCLUDED.role,
    permissions   = EXCLUDED.permissions,
    invited_by    = EXCLUDED.invited_by,
    updated_at    = now(),
    expires_at    = now() + interval '90 days'
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

-- ── Enforce the same guard server-side on direct membership invite ─────────
-- (defense in depth: blocks a client that skips the precheck call and calls
-- the org_members insert path directly for an existing-user invite)

CREATE OR REPLACE FUNCTION public.invite_existing_user_to_org(
  p_org_id uuid,
  p_user_id uuid,
  p_role text,
  p_permissions jsonb DEFAULT '{}'::jsonb
)
  RETURNS public.organization_members
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.organization_members;
  v_other_org_count int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = p_org_id
      AND om.user_id = v_uid
      AND om.role IN ('owner', 'admin')
      AND om.status = 'active'
  ) THEN
    RAISE EXCEPTION 'Only active org admins can invite team members';
  END IF;

  SELECT id, status, role INTO v_row
  FROM public.organization_members
  WHERE organization_id = p_org_id AND user_id = p_user_id
  LIMIT 1;

  IF v_row.id IS NOT NULL THEN
    IF v_row.status = 'active' THEN
      RAISE EXCEPTION 'already_member';
    END IF;
    IF v_row.status = 'pending' THEN
      RAISE EXCEPTION 'already_invited';
    END IF;
  END IF;

  SELECT count(*) INTO v_other_org_count
  FROM public.organization_members om
  WHERE om.user_id = p_user_id
    AND om.organization_id <> p_org_id
    AND om.status IN ('active', 'pending');

  IF v_other_org_count > 0 THEN
    RAISE EXCEPTION 'belongs_to_other_org: This person already belongs to another organization on Pulse and cannot be added here.';
  END IF;

  IF v_row.id IS NOT NULL THEN
    UPDATE public.organization_members
    SET status = 'pending', role = p_role, permissions = p_permissions, joined_at = now()
    WHERE id = v_row.id
    RETURNING * INTO v_row;
  ELSE
    INSERT INTO public.organization_members (organization_id, user_id, role, status, permissions, joined_at)
    VALUES (p_org_id, p_user_id, p_role, 'pending', p_permissions, now())
    RETURNING * INTO v_row;
  END IF;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.invite_existing_user_to_org(uuid, uuid, text, jsonb) TO authenticated;
