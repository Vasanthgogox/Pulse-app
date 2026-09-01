-- Fixes a real, pre-existing bug in Platform IAM's original RLS policies
-- (20261224000000_platform_iam.sql), found via S3b's live verification -- this was never caused
-- by anything added in S3a/S3b.
--
-- platform_users_self_or_staff's own USING clause queries platform_users from within
-- platform_users's own policy (a direct self-reference), and platform_roles_staff_read /
-- platform_permissions_staff_read / platform_role_members_self_or_staff / platform_events_
-- staff_read all query platform_users too -- so evaluating ANY of these five policies as a real
-- `authenticated` role recurses back into platform_users's own (broken) policy and Postgres
-- raises "infinite recursion detected in policy for relation platform_users" (42P17).
--
-- This was invisible until now because platform_users had zero rows before this session (RLS
-- was never meaningfully exercised) and every prior test in this session used either `postgres`
-- (bypasses RLS) or SECURITY DEFINER RPCs (also bypass RLS internally) -- never a genuine
-- `authenticated`-role query. Confirmed directly: `set local role authenticated; select ... from
-- platform_roles` reproduces 42P17 on the live database before this fix.
--
-- Concretely, this is why the Admin Users roster showed a blank role and the Invite Admin
-- dropdown was empty: analytics/'s supabaseAuth.from('platform_roles').select(...) call runs as
-- the real authenticated user, hit this recursion error, and the calling code's
-- `if (error || !data) return []` silently swallowed it into an empty array.
--
-- Fix: route every one of these policies through SECURITY DEFINER helper functions instead of a
-- raw subquery. A SECURITY DEFINER function's internal reads execute as the function owner
-- (bypasses RLS, same mechanism has_platform_permission()/get_my_platform_permissions() already
-- rely on) -- so the same underlying question gets answered without ever re-triggering RLS on
-- platform_users. Preserves each policy's exact original semantics; nothing about who can read
-- what changes, only how the check is computed.

CREATE OR REPLACE FUNCTION public.is_active_platform_user(p_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.platform_users WHERE user_id = p_user_id AND status = 'active'
  );
$$;

REVOKE ALL ON FUNCTION public.is_active_platform_user(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_active_platform_user(uuid) FROM anon;

CREATE OR REPLACE FUNCTION public.platform_user_id_for_auth_user(p_user_id uuid)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
  SELECT id FROM public.platform_users WHERE user_id = p_user_id;
$$;

REVOKE ALL ON FUNCTION public.platform_user_id_for_auth_user(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_user_id_for_auth_user(uuid) FROM anon;

-- Matches platform_users_self_or_staff's original second branch exactly: "holds at least one
-- role membership row" -- deliberately NOT status-filtered, same as the policy being replaced
-- (the bootstrap comment on that policy explains why: a brand-new, not-yet-active platform_user
-- must still be able to read their own row).
CREATE OR REPLACE FUNCTION public.platform_user_holds_any_role(p_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.platform_role_members
    WHERE platform_user_id = public.platform_user_id_for_auth_user(p_user_id)
  );
$$;

REVOKE ALL ON FUNCTION public.platform_user_holds_any_role(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_user_holds_any_role(uuid) FROM anon;

DROP POLICY IF EXISTS "platform_users_self_or_staff" ON public.platform_users;
CREATE POLICY "platform_users_self_or_staff" ON public.platform_users
  FOR SELECT USING (
    user_id = (select auth.uid())
    OR public.platform_user_holds_any_role((select auth.uid()))
  );

DROP POLICY IF EXISTS "platform_roles_staff_read" ON public.platform_roles;
CREATE POLICY "platform_roles_staff_read" ON public.platform_roles
  FOR SELECT USING (public.is_active_platform_user((select auth.uid())));

DROP POLICY IF EXISTS "platform_permissions_staff_read" ON public.platform_permissions;
CREATE POLICY "platform_permissions_staff_read" ON public.platform_permissions
  FOR SELECT USING (public.is_active_platform_user((select auth.uid())));

DROP POLICY IF EXISTS "platform_role_members_self_or_staff" ON public.platform_role_members;
CREATE POLICY "platform_role_members_self_or_staff" ON public.platform_role_members
  FOR SELECT USING (
    platform_user_id = public.platform_user_id_for_auth_user((select auth.uid()))
    OR public.is_active_platform_user((select auth.uid()))
  );

DROP POLICY IF EXISTS "platform_events_staff_read" ON public.platform_events;
CREATE POLICY "platform_events_staff_read" ON public.platform_events
  FOR SELECT USING (public.is_active_platform_user((select auth.uid())));
