-- Fix: SELECT ... INTO a composite rowtype fills fields POSITIONALLY, not by
-- name. `SELECT id, status, role INTO v_row` put status ('inactive') into
-- v_row.organization_id (uuid) and role into v_row.user_id (uuid), so any
-- invite of a user with an existing row in this org failed with
--   invalid input syntax for type uuid: "inactive"
-- before ever reaching the inactive->pending re-invite branch below, which
-- was correct all along. Only the SELECT line changes.
--
-- Note: the re-invite branch sets joined_at = now() -- unchanged here, and
-- deliberate: get_my_team_invites() orders the invitee's inbox by joined_at,
-- so a re-invite should surface as fresh. created_at retains the original
-- membership date. belongs_to_other_org behavior is also left as-is; its
-- ordering relative to the local-row check is a separate issue.

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

  SELECT * INTO v_row
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
