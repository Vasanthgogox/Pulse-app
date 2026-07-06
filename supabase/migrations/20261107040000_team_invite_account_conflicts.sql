-- Team invite account conflicts: email/phone already registered must not use pending-signup path.

-- ── Lookup profile by email (admin invite flow) ─────────────────────────────

CREATE OR REPLACE FUNCTION public.get_user_profile_by_email(p_email text)
  RETURNS TABLE(
    user_id    uuid,
    full_name  text,
    phone      text,
    email      text,
    avatar_url text,
    role       text
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT
    p.id,
    p.full_name,
    p.phone,
    p.email,
    p.avatar_url,
    p.role
  FROM public.profiles p
  WHERE lower(trim(p.email)) = lower(trim(p_email))
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_profile_by_email(text) TO authenticated;

-- ── Signup precheck (anon): email already registered? ─────────────────────────

CREATE OR REPLACE FUNCTION public.check_email_registered_for_signup(p_email text)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_email text := lower(trim(coalesce(p_email, '')));
  v_found text;
BEGIN
  IF v_email = '' OR position('@' in v_email) = 0 THEN
    RETURN jsonb_build_object('exists', false);
  END IF;

  SELECT lower(trim(u.email)) INTO v_found
  FROM auth.users u
  WHERE lower(trim(u.email)) = v_email
  LIMIT 1;

  IF v_found IS NULL THEN
    SELECT lower(trim(p.email)) INTO v_found
    FROM public.profiles p
    WHERE lower(trim(p.email)) = v_email
    LIMIT 1;
  END IF;

  IF v_found IS NULL THEN
    RETURN jsonb_build_object('exists', false);
  END IF;

  RETURN jsonb_build_object(
    'exists', true,
    'masked_email', regexp_replace(v_found, '(^.).*(@.*$)', '\1***\2')
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_email_registered_for_signup(text) TO anon, authenticated;

-- ── Admin precheck before invite ────────────────────────────────────────────

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
      AND om.status = 'active';

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

GRANT EXECUTE ON FUNCTION public.precheck_team_invite_contact(uuid, text, text) TO authenticated;

-- ── Block pending invites for registered emails ─────────────────────────────

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
  v_canon text;
  v_email text := nullif(lower(trim(coalesce(p_email, ''))), '');
  v_row   public.organization_team_invites;
  v_uid   uuid := auth.uid();
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

  IF EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE public.normalize_phone_canon(p.phone) = v_canon
  ) THEN
    RAISE EXCEPTION 'This phone already has a Pulse account — invite them as an existing user';
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

-- ── Pending roster: flag email conflicts for admin UI ───────────────────────

CREATE OR REPLACE FUNCTION public.get_org_team_pending_invites(p_org_id uuid)
  RETURNS TABLE(
    id                  uuid,
    organization_id     uuid,
    invitee_name        text,
    invitee_phone       text,
    invitee_email       text,
    role                text,
    permissions         jsonb,
    status              text,
    created_at          timestamptz,
    expires_at          timestamptz,
    email_conflict      boolean,
    conflict_org_names  text[]
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT
    ti.id,
    ti.organization_id,
    ti.invitee_name,
    ti.invitee_phone,
    ti.invitee_email,
    ti.role,
    ti.permissions,
    ti.status,
    ti.created_at,
    ti.expires_at,
    (
      ti.invitee_email IS NOT NULL
      AND trim(ti.invitee_email) <> ''
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE lower(trim(p.email)) = lower(trim(ti.invitee_email))
      )
    ) AS email_conflict,
    coalesce((
      SELECT array_agg(DISTINCT coalesce(o.name, 'Organization'))
      FROM public.profiles p
      JOIN public.organization_members om ON om.user_id = p.id AND om.status = 'active'
      JOIN public.organizations o ON o.id = om.organization_id
      WHERE ti.invitee_email IS NOT NULL
        AND lower(trim(p.email)) = lower(trim(ti.invitee_email))
        AND om.organization_id <> p_org_id
    ), ARRAY[]::text[]) AS conflict_org_names
  FROM public.organization_team_invites ti
  WHERE ti.organization_id = p_org_id
    AND ti.status = 'pending'
    AND ti.expires_at > now()
    AND public.is_org_member(p_org_id)
  ORDER BY ti.created_at ASC;
$$;

-- Resolver: include invitee_email for signup conflict detection
CREATE OR REPLACE FUNCTION public.resolve_pending_team_invitations_by_phone(p_phone text)
  RETURNS TABLE(
    invitee_name          text,
    invite_id             uuid,
    organization_id       uuid,
    organization_name     text,
    invited_by_name       text,
    role                  text,
    platform_role         text,
    business_unit_name    text,
    department_name       text,
    invitee_email         text,
    created_at            timestamptz,
    expires_at            timestamptz,
    is_expired            boolean,
    status                text
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
    ti.invitee_email,
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
