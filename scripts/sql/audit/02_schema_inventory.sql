-- Deployed public relations: tables, views, materialized views.
SELECT c.relkind,
       CASE c.relkind
         WHEN 'r' THEN 'table'
         WHEN 'v' THEN 'view'
         WHEN 'm' THEN 'materialized_view'
         WHEN 'p' THEN 'partitioned_table'
         WHEN 'I' THEN 'partitioned_index'
         ELSE c.relkind::text
       END                    AS kind,
       n.nspname              AS schema,
       c.relname              AS name
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind IN ('r', 'v', 'm', 'p')
ORDER BY kind, name;

-- App-critical objects: existence probe (edit list for your product).
-- NULL = object missing in THIS database (drift vs app/migrations).
SELECT x.name,
       to_regclass(format('public.%I', x.name)) IS NOT NULL AS exists
FROM (VALUES
  ('loads'),
  ('indent_stops'),
  ('trip_lrs'),
  ('trip_pods'),
  ('pod_attachments'),
  ('courier_partners'),
  ('shared_ledger_connection'),
  ('branding_settings')
) AS x(name);
