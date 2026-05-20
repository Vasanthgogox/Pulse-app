-- SECURITY DEFINER / INVOKER mix in public (RLS bypass risk surface).
SELECT p.proname,
       p.prosecdef AS security_definer,
       l.lanname     AS language,
       pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
JOIN pg_language l ON l.oid = p.prolang
WHERE n.nspname = 'public'
ORDER BY p.prosecdef DESC, p.proname;
