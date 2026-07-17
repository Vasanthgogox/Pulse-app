-- Deliver realtime events for network (org↔org) DMs.
-- Without these tables in supabase_realtime, clients subscribe but never receive
-- INSERT/UPDATE — receivers only see bubbles after manual refresh.
-- Filtered subscriptions (org_a_id / conversation_id) need REPLICA IDENTITY FULL.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'network_conversations'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.network_conversations';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'network_messages'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.network_messages';
  END IF;
END;
$$;

ALTER TABLE public.network_conversations REPLICA IDENTITY FULL;
ALTER TABLE public.network_messages REPLICA IDENTITY FULL;
