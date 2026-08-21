-- Department Manager: a member with permissions.isDepartmentManager = true can
-- edit *surface* toggles (lib/memberSurfaces.ts drill-down grants) for other
-- members who share their own permissions.platformRole (their department) —
-- without becoming an org admin/owner and without going through the
-- owner-only set_member_role RPC (20261212090000).
--
-- Deliberately narrow: this RPC can ONLY merge the `surfaces` key of the
-- target's permissions jsonb. It cannot change role, platformRole, domains,
-- grants, or isDepartmentManager itself — those still require the owner via
-- set_member_role. Promoting/demoting a manager is therefore still
-- owner-only, per docs/RBAC_OPERATING_MODEL.md "Owner-only Access Control".

CREATE OR REPLACE FUNCTION public.set_member_surfaces_as_manager(
  p_member_id uuid,
  p_surfaces  jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_uid          uuid := auth.uid();
  v_org_id       uuid;
  v_actor_perms  jsonb;
  v_target_perms jsonb;
  v_target_role  text;
  v_actor_dept   text;
  v_target_dept  text;
  v_new_perms    jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_surfaces IS NULL OR jsonb_typeof(p_surfaces) <> 'object' THEN
    RAISE EXCEPTION 'invalid_surfaces: p_surfaces must be a JSON object';
  END IF;

  SELECT organization_id, permissions
    INTO v_org_id, v_actor_perms
  FROM organization_members
  WHERE user_id = v_uid AND status = 'active';

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'not_a_member: caller is not an active member of an organization';
  END IF;

  IF COALESCE((v_actor_perms->>'isDepartmentManager')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'not_department_manager: caller is not a department manager';
  END IF;

  v_actor_dept := v_actor_perms->>'platformRole';
  IF v_actor_dept IS NULL THEN
    RAISE EXCEPTION 'not_department_manager: caller has no platformRole/department';
  END IF;

  SELECT organization_id, role, permissions
    INTO v_org_id, v_target_role, v_target_perms
  FROM organization_members
  WHERE id = p_member_id AND organization_id = v_org_id;

  IF v_target_role IS NULL THEN
    RAISE EXCEPTION 'Member not found';
  END IF;

  IF v_target_role IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'cannot_edit_admin: a department manager cannot edit an owner or admin';
  END IF;

  v_target_dept := v_target_perms->>'platformRole';
  IF v_target_dept IS DISTINCT FROM v_actor_dept THEN
    RAISE EXCEPTION 'cross_department: a department manager can only edit members of their own department';
  END IF;

  IF p_member_id = (SELECT id FROM organization_members WHERE user_id = v_uid AND organization_id = v_org_id) THEN
    RAISE EXCEPTION 'cannot_edit_self: a department manager cannot edit their own surfaces';
  END IF;

  -- Merge only the `surfaces` key — every other permissions field is preserved untouched.
  v_new_perms := COALESCE(v_target_perms, '{}'::jsonb)
    || jsonb_build_object('surfaces', COALESCE(v_target_perms->'surfaces', '{}'::jsonb) || p_surfaces);

  UPDATE organization_members
     SET permissions = v_new_perms
   WHERE id = p_member_id;

  INSERT INTO workspace_audit_log (org_id, actor_id, event_type, payload)
  VALUES (
    v_org_id,
    v_uid,
    'member.surfaces_update_by_manager',
    jsonb_build_object('member_id', p_member_id, 'department', v_actor_dept, 'surfaces', p_surfaces)
  );

  RETURN jsonb_build_object('ok', true, 'member_id', p_member_id, 'surfaces', v_new_perms->'surfaces');
END;
$$;

REVOKE ALL ON FUNCTION public.set_member_surfaces_as_manager(uuid, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.set_member_surfaces_as_manager(uuid, jsonb) TO authenticated;

COMMENT ON FUNCTION public.set_member_surfaces_as_manager(uuid, jsonb) IS
  'Department-manager-only surface write. Caller must have permissions.isDepartmentManager=true; can only merge the surfaces key on members sharing the caller''s own platformRole, never role/platformRole/domains/isDepartmentManager itself, never owner/admin rows, never self.';
