-- S3b — Admin Console membership management: invite, role assignment, activation,
-- suspend/reactivate, removal — all backed by the existing Platform IAM tables
-- (platform_users / platform_role_members / platform_roles / platform_permissions),
-- per the locked decision to extend that model rather than reuse organization_members.
--
-- Locked decisions (docs/SUPPORT_S3B_ADMIN_MEMBERSHIP_PLAN.md /
-- docs/SUPPORT_S3B_IMPLEMENTATION_PLAN.md):
--   1. Role-only assignment -- no per-admin permission overrides.
--   2. Self-serve invitation -- an admin never creates/knows another person's password.
--      The actual auth.users creation + invite email happens client-side via the Auth Admin API
--      (auth.admin.inviteUserByEmail, using the existing service-role client) -- Postgres has no
--      way to call that HTTP API itself. This migration only adds the Platform IAM side: what
--      happens once the target auth.users id is known.
--   3. invited -> active -> suspended lifecycle. invited grants no permissions (has_platform_
--      permission already filters status = 'active', so this is free); only active users can use
--      the console; activation happens automatically on first successful login, not by any admin
--      action.
--   4. Mandatory, server-side last-active-super_admin guard on every action that could remove it.
--   5. super_admin manages everything in v1 -- one new permission, granted only to that role.
--   6. Real enforcement from day one -- these RPCs check the caller's actual platform permission
--      (via a service_role-OR-has_platform_permission bridge, same shape as can_review_driver_kyc),
--      not merely a UI hide, since a real authenticated console session already exists (S3a).

-- ── 1. Widen the status lifecycle to include 'invited' ──────────────────────────────────────

ALTER TABLE public.platform_users DROP CONSTRAINT platform_users_status_check;
ALTER TABLE public.platform_users ADD CONSTRAINT platform_users_status_check
  CHECK (status IN ('active', 'suspended', 'invited'));

-- ── 2. New permission, granted only to super_admin (no new role) ────────────────────────────

INSERT INTO public.platform_permissions (key, description)
VALUES (
  'platform_admin.manage',
  'Invite, change roles for, suspend/reactivate, and remove Admin Console platform users'
)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.platform_role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.platform_roles r, public.platform_permissions p
WHERE r.name = 'super_admin' AND p.key = 'platform_admin.manage'
ON CONFLICT DO NOTHING;

-- ── 3. Helpers ────────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.can_manage_platform_admins()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
  SELECT
    current_user = 'service_role'
    OR current_setting('role', true) = 'service_role'
    OR public.has_platform_permission((select auth.uid()), 'platform_admin.manage');
$$;

REVOKE ALL ON FUNCTION public.can_manage_platform_admins() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_manage_platform_admins() TO authenticated;

CREATE OR REPLACE FUNCTION public.platform_user_holds_role(
  p_platform_user_id uuid,
  p_role_name text
)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.platform_role_members prm
    JOIN public.platform_roles pr ON pr.id = prm.role_id
    WHERE prm.platform_user_id = p_platform_user_id
      AND pr.name = p_role_name
  );
$$;

REVOKE ALL ON FUNCTION public.platform_user_holds_role(uuid, text) FROM PUBLIC;

-- Excludes the given platform_user from the count -- "would removing/demoting/suspending this
-- specific person leave zero other active super_admins?"
CREATE OR REPLACE FUNCTION public.platform_would_remove_last_super_admin(
  p_excluding_platform_user_id uuid
)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
  SELECT NOT EXISTS (
    SELECT 1
    FROM public.platform_role_members prm
    JOIN public.platform_users pu ON pu.id = prm.platform_user_id
    JOIN public.platform_roles pr ON pr.id = prm.role_id
    WHERE pr.name = 'super_admin'
      AND pu.status = 'active'
      AND pu.id <> p_excluding_platform_user_id
  );
$$;

REVOKE ALL ON FUNCTION public.platform_would_remove_last_super_admin(uuid) FROM PUBLIC;

-- ── 4. activate_platform_user -- self-only, no admin action, no permission check needed ────────
-- Called once by the console's own login-resolution code path (AdminAuthProvider) the moment a
-- real session exists. Can only ever transition the caller's OWN row, and only invited -> active
-- -- cannot be used to activate anyone else, cannot downgrade, cannot create a row.

CREATE OR REPLACE FUNCTION public.activate_platform_user()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  UPDATE public.platform_users
  SET status = 'active'
  WHERE user_id = v_uid
    AND status = 'invited';
END;
$function$;

REVOKE ALL ON FUNCTION public.activate_platform_user() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.activate_platform_user() TO authenticated;

-- ── 5. invite_platform_admin ─────────────────────────────────────────────────────────────────
-- p_target_user_id is already-resolved -- the client calls auth.admin.inviteUserByEmail() first
-- (service-role client, sends the actual email, admin never sees a password) and passes the
-- resulting auth.users.id here. Re-inviting an existing platform_user re-assigns their role
-- (single-role-per-admin invariant preserved), guarded the same as an explicit role change.

CREATE OR REPLACE FUNCTION public.invite_platform_admin(
  p_target_user_id uuid,
  p_role_id uuid
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
  v_platform_user_id uuid;
BEGIN
  IF NOT public.can_manage_platform_admins() THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_target_user_id) THEN
    RAISE EXCEPTION 'auth_user_not_found';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.platform_roles WHERE id = p_role_id) THEN
    RAISE EXCEPTION 'invalid_role';
  END IF;

  SELECT id INTO v_platform_user_id
  FROM public.platform_users WHERE user_id = p_target_user_id;

  IF v_platform_user_id IS NULL THEN
    INSERT INTO public.platform_users (user_id, status)
    VALUES (p_target_user_id, 'invited')
    RETURNING id INTO v_platform_user_id;
  ELSE
    IF public.platform_user_holds_role(v_platform_user_id, 'super_admin')
       AND p_role_id <> (SELECT id FROM public.platform_roles WHERE name = 'super_admin')
       AND public.platform_would_remove_last_super_admin(v_platform_user_id) THEN
      RAISE EXCEPTION 'cannot_remove_last_super_admin';
    END IF;
    DELETE FROM public.platform_role_members WHERE platform_user_id = v_platform_user_id;
  END IF;

  INSERT INTO public.platform_role_members (platform_user_id, role_id, granted_by)
  VALUES (v_platform_user_id, p_role_id, (select auth.uid()));

  PERFORM public.emit_platform_event(
    'PlatformAdminInvited', NULL,
    jsonb_build_object('platform_user_id', v_platform_user_id, 'role_id', p_role_id)
  );

  RETURN v_platform_user_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.invite_platform_admin(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.invite_platform_admin(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.invite_platform_admin(uuid, uuid) TO authenticated;

-- ── 6. change_platform_role -- role-only assignment (decision 1) ───────────────────────────────

CREATE OR REPLACE FUNCTION public.change_platform_role(
  p_platform_user_id uuid,
  p_new_role_id uuid
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
BEGIN
  IF NOT public.can_manage_platform_admins() THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.platform_users WHERE id = p_platform_user_id) THEN
    RAISE EXCEPTION 'platform_user_not_found';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.platform_roles WHERE id = p_new_role_id) THEN
    RAISE EXCEPTION 'invalid_role';
  END IF;

  IF p_new_role_id <> (SELECT id FROM public.platform_roles WHERE name = 'super_admin')
     AND public.platform_user_holds_role(p_platform_user_id, 'super_admin')
     AND public.platform_would_remove_last_super_admin(p_platform_user_id) THEN
    RAISE EXCEPTION 'cannot_remove_last_super_admin';
  END IF;

  DELETE FROM public.platform_role_members WHERE platform_user_id = p_platform_user_id;

  INSERT INTO public.platform_role_members (platform_user_id, role_id, granted_by)
  VALUES (p_platform_user_id, p_new_role_id, (select auth.uid()));

  PERFORM public.emit_platform_event(
    'PlatformAdminRoleChanged', NULL,
    jsonb_build_object('platform_user_id', p_platform_user_id, 'new_role_id', p_new_role_id)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.change_platform_role(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.change_platform_role(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.change_platform_role(uuid, uuid) TO authenticated;

-- ── 7. set_platform_user_status -- suspend/reactivate only; cannot be used to set 'invited' ────

CREATE OR REPLACE FUNCTION public.set_platform_user_status(
  p_platform_user_id uuid,
  p_status text
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
BEGIN
  IF NOT public.can_manage_platform_admins() THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  IF p_status NOT IN ('active', 'suspended') THEN
    RAISE EXCEPTION 'invalid_status';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.platform_users WHERE id = p_platform_user_id) THEN
    RAISE EXCEPTION 'platform_user_not_found';
  END IF;

  IF p_status = 'suspended'
     AND public.platform_user_holds_role(p_platform_user_id, 'super_admin')
     AND public.platform_would_remove_last_super_admin(p_platform_user_id) THEN
    RAISE EXCEPTION 'cannot_remove_last_super_admin';
  END IF;

  UPDATE public.platform_users SET status = p_status WHERE id = p_platform_user_id;

  PERFORM public.emit_platform_event(
    'PlatformAdminStatusChanged', NULL,
    jsonb_build_object('platform_user_id', p_platform_user_id, 'status', p_status)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.set_platform_user_status(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_platform_user_status(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_platform_user_status(uuid, text) TO authenticated;

-- ── 8. remove_platform_admin -- full removal, cascades to platform_role_members ────────────────

CREATE OR REPLACE FUNCTION public.remove_platform_admin(
  p_platform_user_id uuid
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
BEGIN
  IF NOT public.can_manage_platform_admins() THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.platform_users WHERE id = p_platform_user_id) THEN
    RAISE EXCEPTION 'platform_user_not_found';
  END IF;

  IF public.platform_user_holds_role(p_platform_user_id, 'super_admin')
     AND public.platform_would_remove_last_super_admin(p_platform_user_id) THEN
    RAISE EXCEPTION 'cannot_remove_last_super_admin';
  END IF;

  DELETE FROM public.platform_users WHERE id = p_platform_user_id;

  PERFORM public.emit_platform_event(
    'PlatformAdminRemoved', NULL,
    jsonb_build_object('platform_user_id', p_platform_user_id)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.remove_platform_admin(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.remove_platform_admin(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.remove_platform_admin(uuid) TO authenticated;

-- ── 9. list_platform_admins -- the roster read. Needed because auth.users (for email,
-- last_sign_in_at) isn't reachable via PostgREST directly regardless of RLS; a SECURITY DEFINER
-- function is the only way to join it in. Gated the same as the write actions (decision 4:
-- super_admin manages everything in v1 -- viewing the roster is part of "managing" it).

CREATE OR REPLACE FUNCTION public.list_platform_admins()
RETURNS TABLE (
  platform_user_id uuid,
  user_id uuid,
  email text,
  status text,
  role_id uuid,
  role_name text,
  last_sign_in_at timestamptz,
  created_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
BEGIN
  IF NOT public.can_manage_platform_admins() THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  RETURN QUERY
  SELECT
    pu.id,
    pu.user_id,
    u.email,
    pu.status,
    pr.id,
    pr.name,
    u.last_sign_in_at,
    pu.created_at
  FROM public.platform_users pu
  JOIN auth.users u ON u.id = pu.user_id
  LEFT JOIN public.platform_role_members prm ON prm.platform_user_id = pu.id
  LEFT JOIN public.platform_roles pr ON pr.id = prm.role_id
  ORDER BY pu.created_at ASC;
END;
$function$;

REVOKE ALL ON FUNCTION public.list_platform_admins() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_platform_admins() TO authenticated;
