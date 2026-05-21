-- Fix phantom Pulse Chat unread badges:
-- 1) Ledger/system rows were incrementing unread_dispatcher_count (payment toasts).
-- 2) mark_messages_seen / mark_conversation_read re-derived counts including those rows.
-- 3) One-time reconcile denormalized counters from actionable inbound messages only.

-- ── Shared rule: which trip_messages count toward dispatcher unread ───────────

CREATE OR REPLACE FUNCTION public.fn_trip_message_counts_as_dispatcher_unread(
  p_sender_role  TEXT,
  p_message_type TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT COALESCE(p_sender_role, '') NOT IN ('dispatcher', 'system')
     AND COALESCE(p_message_type, '') NOT IN (
       'ledger_event',
       'ledger',
       'payment',
       'ledger_update'
     );
$$;

COMMENT ON FUNCTION public.fn_trip_message_counts_as_dispatcher_unread(TEXT, TEXT) IS
  'True when a trip_messages row should affect trip_conversations.unread_dispatcher_count. '
  'Excludes own dispatcher sends, system role, and ledger/payment automation types.';

-- ── Reconcile denormalized counter for one conversation ───────────────────────

CREATE OR REPLACE FUNCTION public.fn_reconcile_trip_conversation_unread(p_conversation_id UUID)
RETURNS INTEGER
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT COUNT(*)::int
    FROM   public.trip_messages tm
    WHERE  tm.conversation_id = p_conversation_id
      AND  tm.is_read = FALSE
      AND  public.fn_trip_message_counts_as_dispatcher_unread(tm.sender_role, tm.message_type)
  ), 0);
$$;

-- ── sync_conversation_on_message: do not bump on ledger/system ────────────────

CREATE OR REPLACE FUNCTION public.sync_conversation_on_message()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SET search_path = ''
AS $$
BEGIN
  UPDATE public.trip_conversations
  SET
    last_message_at      = NEW.created_at,
    last_message_preview = LEFT(NEW.content, 120),
    unread_dispatcher_count = CASE
      WHEN public.fn_trip_message_counts_as_dispatcher_unread(NEW.sender_role, NEW.message_type)
      THEN unread_dispatcher_count + 1
      ELSE unread_dispatcher_count
    END,
    updated_at = NOW()
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

-- ── mark_messages_seen: re-derive with actionable filter ──────────────────────

CREATE OR REPLACE FUNCTION public.mark_messages_seen(
  p_conversation_id UUID,
  p_message_ids     UUID[]
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.trip_messages
  SET    is_read  = TRUE,
         read_at  = now()
  WHERE  id              = ANY(p_message_ids)
    AND  conversation_id = p_conversation_id
    AND  is_read         = FALSE;

  UPDATE public.trip_conversations
  SET    unread_dispatcher_count = public.fn_reconcile_trip_conversation_unread(p_conversation_id),
         updated_at = NOW()
  WHERE  id = p_conversation_id;
END;
$$;

-- ── mark_conversation_read: align message + counter filters ───────────────────

CREATE OR REPLACE FUNCTION public.mark_conversation_read(p_conversation_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.trip_messages
  SET    is_read = TRUE,
         read_at = COALESCE(read_at, NOW())
  WHERE  conversation_id = p_conversation_id
    AND  is_read = FALSE
    AND  public.fn_trip_message_counts_as_dispatcher_unread(sender_role, message_type);

  UPDATE public.trip_conversations
  SET    unread_dispatcher_count = public.fn_reconcile_trip_conversation_unread(p_conversation_id),
         updated_at = NOW()
  WHERE  id = p_conversation_id;
END;
$$;

COMMENT ON FUNCTION public.mark_conversation_read(UUID) IS
  'Marks actionable inbound unread messages read and re-derives unread_dispatcher_count '
  '(excludes dispatcher/system sends and ledger/payment automation).';

COMMENT ON FUNCTION public.mark_messages_seen(UUID, UUID[]) IS
  'Per-message seen tracking; re-derives unread_dispatcher_count from actionable inbound rows only.';

-- ── Backfill: zero phantom counters (ledger-only unread, etc.) ────────────────

UPDATE public.trip_conversations tc
SET    unread_dispatcher_count = public.fn_reconcile_trip_conversation_unread(tc.id),
       updated_at = NOW()
WHERE  tc.unread_dispatcher_count <> public.fn_reconcile_trip_conversation_unread(tc.id);

-- Mark stale ledger/system rows read when they were the only "unread" driver
UPDATE public.trip_messages tm
SET    is_read = TRUE,
       read_at = COALESCE(read_at, NOW())
WHERE  tm.is_read = FALSE
  AND  NOT public.fn_trip_message_counts_as_dispatcher_unread(tm.sender_role, tm.message_type);
