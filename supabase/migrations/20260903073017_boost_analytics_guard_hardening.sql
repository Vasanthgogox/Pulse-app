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