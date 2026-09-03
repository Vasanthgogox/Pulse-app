-- Boost panel — tighten the get_boost_control_center() authorization guard.
--
-- The existing guard is conditional on having an identity:
--
--   IF (select auth.uid()) IS NOT NULL
--      AND NOT public.has_platform_permission((select auth.uid()), 'analytics.view')
--   THEN RAISE EXCEPTION ...
--
-- so a caller whose auth.uid() is NULL skips the permission check entirely. That
-- was deliberate when written -- the comment in the body says "Service-role
-- callers (admin console) have no auth.uid()" -- because the console had no
-- logged-in user and NULL was the only way service_role could get through.
--
-- Measured: `set role authenticated` with no JWT sub returns data, confirming
-- the bypass is real. It is NOT reachable through the API today, because
-- 20270306030000 revoked anon EXECUTE and a genuine authenticated PostgREST
-- request always carries a sub claim -- so this is defence-in-depth debt rather
-- than a live vulnerability. It matters now because the Boost panel is moving
-- onto the admin's session, which makes NULL-uid the anomalous case rather than
-- the normal one.
--
-- Fix: authorize positively -- a trusted server-side caller OR a real holder of
-- analytics.view. NULL uid no longer means "skip the check", it means "no
-- permission". service_role keeps working via the explicit role test, so
-- existing server-side callers are unaffected.
--
-- The function's entire query body is preserved byte-for-byte; only the four
-- lines of the guard change. STABLE, SECURITY DEFINER and search_path are kept.

DO $migrate$
DECLARE
  v_def text;
  v_old text;
  v_new text;
BEGIN
  SELECT pg_get_functiondef(p.oid)
    INTO v_def
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
   WHERE p.proname = 'get_boost_control_center'
   LIMIT 1;

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'public.get_boost_control_center() not found';
  END IF;

  v_old := '  IF (select auth.uid()) IS NOT NULL' || E'\n'
        || '     AND NOT public.has_platform_permission((select auth.uid()), ''analytics.view'') THEN' || E'\n'
        || '    RAISE EXCEPTION ''unauthorized: analytics.view permission required'';' || E'\n'
        || '  END IF;';

  v_new := '  IF NOT (' || E'\n'
        || '    COALESCE(public.has_platform_permission((select auth.uid()), ''analytics.view''), false)' || E'\n'
        || '    OR COALESCE((select auth.role()) = ''service_role'', false)' || E'\n'
        || '    OR COALESCE(current_user = ''service_role'', false)' || E'\n'
        || '    OR COALESCE(current_setting(''role'', true) = ''service_role'', false)' || E'\n'
        || '  ) THEN' || E'\n'
        || '    RAISE EXCEPTION ''unauthorized: analytics.view permission required'';' || E'\n'
        || '  END IF;';

  IF position(v_old in v_def) = 0 THEN
    -- Already hardened, or the guard was reworded upstream. Do not guess.
    IF position('OR COALESCE((select auth.role()) = ''service_role''' in v_def) > 0 THEN
      RAISE NOTICE 'get_boost_control_center already hardened; skipping';
      RETURN;
    END IF;
    RAISE EXCEPTION 'guard text not found in get_boost_control_center -- aborting rather than rewriting blind';
  END IF;

  v_def := replace(v_def, v_old, v_new);
  EXECUTE v_def;
  RAISE NOTICE 'hardened public.get_boost_control_center() guard';
END
$migrate$;

REVOKE EXECUTE ON FUNCTION public.get_boost_control_center() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_boost_control_center() TO authenticated, service_role;
