-- SECURITY FIX: SEC-1
-- All SECURITY DEFINER functions in public schema were callable by anon.
-- Revoke EXECUTE from anon and re-grant only to authenticated.

DO $$
DECLARE
  func_rec record;
BEGIN
  FOR func_rec IN
    SELECT proname, pg_get_function_identity_arguments(oid) AS args
    FROM pg_proc
    WHERE pronamespace = 'public'::regnamespace
      AND prosecdef = true
  LOOP
    BEGIN
      EXECUTE format(
        'REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM anon',
        func_rec.proname, func_rec.args
      );
    EXCEPTION WHEN others THEN
      NULL; -- skip if already revoked or not applicable
    END;
  END LOOP;
END;
$$;
