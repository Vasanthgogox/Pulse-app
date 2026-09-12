-- Gate Ground Ops team member invitations by organization toggle.
-- Prevent inviting/assigning ground_ops when groundOpsDocUploadEnabled is OFF.
-- Matches the trip_documents RLS policy approach: fail-closed (missing toggle = disabled).

-- Update invite_existing_user_to_org: reject ground_ops when toggle is OFF
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
  v_platform_role text;
  v_toggle_enabled boolean;
  v_org_settings jsonb;
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

  -- Extract platformRole from permissions JSONB
  v_platform_role := p_permissions ->> 'platformRole';

  -- Check Ground Ops toggle if platformRole is ground_ops
  IF v_platform_role = 'ground_ops' THEN
    SELECT settings INTO v_org_settings
    FROM public.organizations
    WHERE id = p_org_id;

    v_toggle_enabled := COALESCE((v_org_settings ->> 'groundOpsDocUploadEnabled')::boolean, false);

    IF NOT v_toggle_enabled THEN
      RAISE EXCEPTION 'ground_ops_disabled: Ground Ops document upload is not enabled for this organization';
    END IF;
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

-- Update create_team_invite_pending: reject ground_ops when toggle is OFF
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
  v_platform_role text;
  v_toggle_enabled boolean;
  v_org_settings jsonb;
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

  -- Extract platformRole from permissions JSONB
  v_platform_role := p_permissions ->> 'platformRole';

  -- Check Ground Ops toggle if platformRole is ground_ops
  IF v_platform_role = 'ground_ops' THEN
    SELECT settings INTO v_org_settings
    FROM public.organizations
    WHERE id = p_org_id;

    v_toggle_enabled := COALESCE((v_org_settings ->> 'groundOpsDocUploadEnabled')::boolean, false);

    IF NOT v_toggle_enabled THEN
      RAISE EXCEPTION 'ground_ops_disabled: Ground Ops document upload is not enabled for this organization';
    END IF;
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
    IF EXISTS (SELECT 1 FROM auth.users u WHERE lower(trim(u.email)) = v_email) THEN
      RAISE EXCEPTION 'email_registered: This email already has a Pulse account. Remove the email or ask them to sign in.';
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.organization_team_invites oti
    WHERE oti.organization_id = p_org_id
      AND public.normalize_phone_canon(oti.phone) = v_canon
      AND oti.status IN ('pending', 'claimed')
  ) THEN
    RAISE EXCEPTION 'idx_org_team_invites_pending_phone: duplicate';
  END IF;

  INSERT INTO public.organization_team_invites (
    organization_id, phone, name, email, role, permissions, status
  ) VALUES (
    p_org_id, v_canon, trim(p_name), v_email, p_role, p_permissions, 'pending'
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_team_invite_pending(uuid, text, text, text, text, jsonb) TO authenticated;
