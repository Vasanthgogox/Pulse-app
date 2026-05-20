-- Trigger → function map for public user tables (internal triggers excluded).
SELECT c.relname AS table_name,
       t.tgname  AS trigger_name,
       (t.tgfoid)::regprocedure AS function_identity
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND NOT t.tgisinternal
ORDER BY c.relname, t.tgname;
