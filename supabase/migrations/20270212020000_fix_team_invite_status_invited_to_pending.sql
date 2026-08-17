-- organization_members.status only ever allowed ('active','inactive','pending')
-- (see organization_members_status_check, defined since 20250227120000_initial_schema.sql),
-- but accept_team_invite / reject_team_invite / get_my_team_invites were written
-- against a non-existent 'invited' value, so the existing-user invite path has
-- never produced a row these RPCs could find. Align them to 'pending'.

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
