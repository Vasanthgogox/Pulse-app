-- Add organization_members table to supabase_realtime publication
-- Required for realtime roster updates (accept/reject team invites).
-- Mirrors the pattern from 20261107010000_organization_team_phone_invites.sql

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.organization_members;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
