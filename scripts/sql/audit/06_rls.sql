-- RLS enabled + policy counts (Supabase apps: policies are part of the security model).
SELECT c.relname AS table_name,
       c.relrowsecurity AS rls_enabled,
       c.relforcerowsecurity AS rls_force,
       (SELECT count(*) FROM pg_policies pol WHERE pol.schemaname = 'public' AND pol.tablename = c.relname) AS policy_count
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
ORDER BY c.relname;
