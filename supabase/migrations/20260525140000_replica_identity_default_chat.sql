-- ─────────────────────────────────────────────────────────────────────────────
-- REPLICA IDENTITY DEFAULT for chat tables
--
-- Problem: Supabase adds tables to supabase_realtime with REPLICA IDENTITY FULL
-- by default. This means every UPDATE writes the *entire* old row to the WAL
-- (Write Ahead Log) in addition to the new row. For trip_messages, every
-- mark-as-read UPDATE writes the full content/metadata blob twice. Under load
-- this causes realtime.list_changes to scan massive WAL segments, making the
-- query appear in pg_stat_activity and driving CPU/IO into "Unhealthy" status.
--
-- Fix: REPLICA IDENTITY DEFAULT writes only the PK column(s) as the old-row
-- identifier instead of the full row. Safe because:
--   • trip_messages: we subscribe INSERT-only — old row is never needed.
--   • trip_conversations: not subscribed directly (sync trigger writes it),
--     so DEFAULT halves the WAL cost of every sync_conversation_on_message fire.
--   • network_conversations: subscribed for UPDATE but our handlers only read
--     payload.new — payload.old is never used in IntegratedChatContext.
--   • network_messages: not in supabase_realtime; included defensively.
--
-- Expected improvement: ~60-80% reduction in WAL bytes per messaging burst.
-- ─────────────────────────────────────────────────────────────────────────────

-- Primary hot path: subscribed + updated on every mark-as-read
ALTER TABLE public.trip_messages       REPLICA IDENTITY DEFAULT;

-- Updated by sync_conversation_on_message trigger on every message insert
ALTER TABLE public.trip_conversations  REPLICA IDENTITY DEFAULT;

-- B2B network chat — UPDATE events subscribed but payload.old unused by client
ALTER TABLE public.network_conversations REPLICA IDENTITY DEFAULT;

-- Not in realtime publication but included for consistency
ALTER TABLE public.network_messages    REPLICA IDENTITY DEFAULT;


-- ─── Verify publication only covers trip_messages (expected) ─────────────────
-- If network_conversations was accidentally added, each UPDATE broadcasts the
-- full old row to all subscribers before this migration. Log current state.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT schemaname, tablename
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
    ORDER BY tablename
  LOOP
    RAISE NOTICE 'supabase_realtime includes: %.%', r.schemaname, r.tablename;
  END LOOP;
END;
$$;
