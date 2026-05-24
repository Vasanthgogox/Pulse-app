-- Push fleet driver_invites to Supabase Realtime so the driver app invite popup
-- appears immediately when a fleet owner sends or re-opens an invitation.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'driver_invites'
  ) THEN
    RETURN;
  END IF;

  EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.driver_invites';
END;
$$;
