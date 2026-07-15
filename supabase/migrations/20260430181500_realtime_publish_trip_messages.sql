-- Deliver INSERT/UPDATE realtime events to clients subscribing to trip_messages.
-- Without this row, Postgres changes exist in the DB but the browser never receives them.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'trip_messages'
  ) THEN
    RETURN;
  END IF;

  EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.trip_messages';
END;
$$;
