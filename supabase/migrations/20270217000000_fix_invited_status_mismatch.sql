-- Fix status mismatch: organization_members has no 'invited' status (only
-- 'active' | 'inactive' | 'pending' per the table's CHECK constraint), but
-- get_my_team_invites / accept_team_invite / reject_team_invite were written
-- against 'invited'. Every invite is written as 'pending', so those RPCs have
-- always silently matched zero rows — an invited member's invite never shows
-- in their inbox and can never be accepted through them.

CREATE OR REPLACE FUNCTION public.get_my_team_invites()
  RETURNS TABLE(
    id               uuid,
    organization_id  uuid,
    role             text,
    joined_at        timestamptz,
    org_name         text
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT
    om.id,
    om.organization_id,
    om.role,
    om.joined_at,
    coalesce(o.name, 'Organization')
  FROM public.organization_members om
  LEFT JOIN public.organizations o ON o.id = om.organization_id
  WHERE om.user_id = (SELECT auth.uid())
    AND om.status = 'pending'
  ORDER BY om.joined_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.accept_team_invite(p_org_id uuid)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
BEGIN
  UPDATE public.organization_members
  SET status = 'active'
  WHERE organization_id = p_org_id
    AND user_id = (SELECT auth.uid())
    AND status = 'pending';
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_team_invite(p_org_id uuid)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
BEGIN
  UPDATE public.organization_members
  SET status = 'inactive'
  WHERE organization_id = p_org_id
    AND user_id = (SELECT auth.uid())
    AND status = 'pending';
END;
$$;

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

  IF v_canon IS NOT NULL AND length(v_canon) >= 10 THEN
    SELECT p.id, p.phone, p.email, p.full_name
    INTO v_user_id, v_user_phone, v_user_email, v_user_name
    FROM public.profiles p
    WHERE public.normalize_phone_canon(p.phone) = v_canon
    LIMIT 1;
  END IF;

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

    IF v_target = 'pending' THEN
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
