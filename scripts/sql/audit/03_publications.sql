-- Logical decoding / Supabase Realtime: what is actually published?
SELECT pubname,
       schemaname,
       tablename
FROM pg_publication_tables
ORDER BY pubname, schemaname, tablename;

SELECT p.pubname,
       p.puballtables,
       p.pubinsert,
       p.pubupdate,
       p.pubdelete,
       p.pubtruncate
FROM pg_publication p
ORDER BY p.pubname;
