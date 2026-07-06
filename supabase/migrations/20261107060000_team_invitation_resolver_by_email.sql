-- Team invitation resolver by email (PR-007: real email identity provider).
-- Mirrors resolve_pending_team_invitations_by_phone / expire_stale_team_invitations
-- (20261107020000, updated in 20261107040000), filtering by invitee_email instead of
-- invitee_phone_canon. Additive only — the phone resolver is untouched.

CREATE OR REPLACE FUNCTION public.expire_stale_team_invitations_by_email(p_email text)
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_email text := nullif(lower(trim(coalesce(p_email, ''))), '');
  v_count integer;
BEGIN
  IF v_email IS NULL THEN
    RETURN 0;
  END IF;

  UPDATE public.organization_team_invites
  SET status = 'expired', updated_at = now()
  WHERE lower(trim(invitee_email)) = v_email
    AND status = 'pending'
    AND expires_at <= now();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.expire_stale_team_invitations_by_email(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.resolve_pending_team_invitations_by_email(p_email text)
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
  v_email text := nullif(lower(trim(coalesce(p_email, ''))), '');
BEGIN
  IF v_email IS NULL THEN
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
  WHERE lower(trim(ti.invitee_email)) = v_email
    AND ti.status IN ('pending', 'expired')
  ORDER BY
    CASE WHEN ti.status = 'pending' AND ti.expires_at > now() THEN 0 ELSE 1 END,
    ti.created_at DESC;
END;
$$;

COMMENT ON FUNCTION public.resolve_pending_team_invitations_by_email(text) IS
  'Invitation resolver: list pending/expired email invites for onboarding (post-verification). Mirrors resolve_pending_team_invitations_by_phone.';

GRANT EXECUTE ON FUNCTION public.resolve_pending_team_invitations_by_email(text) TO anon, authenticated;
