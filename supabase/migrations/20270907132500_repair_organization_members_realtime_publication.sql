-- Repair: add public.organization_members to supabase_realtime.
--
-- 20270212000000_organization_members_realtime.sql is recorded on remote, but
-- live pg_publication_tables does not include this table. Do not reuse that
-- version. Replica identity / RLS are intentionally unchanged.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1
       FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public'
         AND tablename = 'organization_members'
     ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.organization_members;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
