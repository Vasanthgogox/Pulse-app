-- Hardening follow-up to 20270304000000_platform_admin_membership.sql.
--
-- This project has a schema-wide default privilege that auto-grants EXECUTE on every new
-- public-schema function to anon (and authenticated, service_role) at CREATE time --
-- `REVOKE ALL ... FROM PUBLIC` does not remove that, only an explicit `REVOKE ... FROM anon`
-- does (same class of gap already found and fixed once for Support's own RPCs in
-- 20270302020000_support_ticket_rpcs_revoke_public.sql -- missed here because these five
-- functions only had the PUBLIC revoke, not the explicit anon one the action RPCs already had).
--
-- Verified empirically before writing this: has_function_privilege('anon', ..., 'execute') was
-- true for all five. None of them leaked data to an anonymous caller -- each already checks
-- auth.uid()/has_platform_permission() internally and correctly rejects a NULL/unauthorized
-- caller -- but anon should never have had the ability to invoke them at all.

REVOKE ALL ON FUNCTION public.activate_platform_user() FROM anon;
REVOKE ALL ON FUNCTION public.can_manage_platform_admins() FROM anon;
REVOKE ALL ON FUNCTION public.list_platform_admins() FROM anon;
REVOKE ALL ON FUNCTION public.platform_user_holds_role(uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.platform_would_remove_last_super_admin(uuid) FROM anon;

-- Real bug, caught by live-testing this function rather than by inspection: auth.users.email is
-- `character varying(255)`, not `text` -- Postgres's RETURN QUERY requires an exact column-type
-- match against the function's declared RETURNS TABLE, so the original version raised
-- "structure of query does not match function result type" on every call and would have broken
-- the Admin Users list entirely. Fixed with an explicit cast; no signature or behavior change.

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
    u.email::text,
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
