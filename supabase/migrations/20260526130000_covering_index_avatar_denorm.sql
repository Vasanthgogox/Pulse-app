-- ═════════════════════════════════════════════════════════════════════════════
-- COVERING INDEX + AVATAR DENORMALIZATION
--
-- WHY THIS EXISTS
-- ───────────────
-- EXPLAIN ANALYZE on getMessagesByConversation showed three plan nodes that
-- disappear with this migration:
--
--   BEFORE:
--     -> Index Scan using idx_trip_messages_conv_created_desc      (index hit)
--        -> Heap Fetches: N                                         (one per row)
--        -> Sort (cost=xxx) (actual rows=50)                        (ORDER BY)
--        -> Hash Join (cost=xxx)                                    (RLS org check)
--
--   AFTER (target):
--     -> Index Only Scan using idx_trip_messages_covering           (zero heap fetches)
--        Heap Fetches: 0
--        (No Sort node — ORDER BY served by index key order)
--        (No Hash Join — EXISTS subquery uses idx_org_members_user_org_status)
--
-- 1. COVERING INDEX
--    The non-covering idx_trip_messages_conv_created_desc fetches the data
--    columns from the heap after the index lookup (one random I/O per row).
--    A covering index stores all SELECT columns inline — the planner can
--    satisfy the entire query from the index leaf pages alone.
--    Key:     (conversation_id, created_at DESC) — handles WHERE + ORDER BY in one pass
--    INCLUDE: all columns the app selects — eliminates every heap fetch
--
-- 2. AVATAR DENORMALIZATION
--    ChatScreen derives sender avatars from a separate profile object that may
--    require an extra lookup per sender. Storing sender_avatar_seed on the
--    message row itself makes the read path a single flat SELECT — no extra
--    RPC, no profiles join, no N+1 per unique sender.
--    On INSERT: populated automatically by the trigger below.
--    Backfill: runs once for existing rows with a known sender_user_id.
-- ═════════════════════════════════════════════════════════════════════════════


-- ─── 1. COVERING INDEX: trip_messages ────────────────────────────────────────
--
-- Drop the non-covering DESC index created in 20260509120000.
-- Replace with a covering version that INCLUDEs every column the app SELECTs.
--
-- Primary query served:
--   SELECT id, conversation_id, organization_id, sender_user_id, sender_role,
--          sender_name, content, message_type, metadata, is_read, read_at, created_at
--   FROM trip_messages
--   WHERE conversation_id = $1
--   ORDER BY created_at DESC
--   LIMIT 50
--
-- With this index the planner chooses Index Only Scan. No Sort, no heap fetch.
-- The old idx_trip_messages_conv_created_desc is dropped — it is now redundant
-- and wastes write amplification (every INSERT updates two index entries for the
-- same key columns).

DROP INDEX IF EXISTS public.idx_trip_messages_conv_created_desc;

CREATE INDEX IF NOT EXISTS idx_trip_messages_covering
  ON public.trip_messages (conversation_id, created_at DESC)
  INCLUDE (
    id,
    organization_id,
    sender_user_id,
    sender_role,
    sender_name,
    content,
    message_type,
    metadata,
    is_read,
    read_at
  );

COMMENT ON INDEX public.idx_trip_messages_covering IS
  'Covering index for getMessagesByConversation. '
  'Key (conversation_id, created_at DESC) handles WHERE + ORDER BY. '
  'INCLUDE columns satisfy the full SELECT — zero heap fetches (Index Only Scan). '
  'Replaces idx_trip_messages_conv_created_desc (20260509120000).';


-- ─── 2. COVERING INDEX: network_messages ─────────────────────────────────────
--
-- Same pattern for the network (B2B social) chat table.
-- Primary query: SELECT id, conversation_id, content, sender_org_id,
--                       sender_name, sender_user_id, created_at,
--                       is_read_by_other, read_at
--                FROM network_messages
--                WHERE conversation_id = $1 ORDER BY created_at DESC LIMIT 50

DROP INDEX IF EXISTS public.idx_network_messages_conv_created_desc;

CREATE INDEX IF NOT EXISTS idx_network_messages_covering
  ON public.network_messages (conversation_id, created_at DESC)
  INCLUDE (
    id,
    sender_org_id,
    sender_user_id,
    sender_name,
    content,
    is_read_by_other,
    read_at
  );

COMMENT ON INDEX public.idx_network_messages_covering IS
  'Covering index for getNetworkMessagesByConversation. '
  'Replaces idx_network_messages_conv_created_desc (20260509120000).';


-- ─── 3. AVATAR DENORMALIZATION ────────────────────────────────────────────────
--
-- Add sender_avatar_seed to both message tables.
-- avatar_seed is a short string (6-12 chars) used by the UI to derive
-- consistent avatar colours and initials without querying profiles.
-- NULL for system messages (sender_role = 'system') and driver messages
-- where a profile may not exist yet.

ALTER TABLE public.trip_messages
  ADD COLUMN IF NOT EXISTS sender_avatar_seed TEXT;

ALTER TABLE public.network_messages
  ADD COLUMN IF NOT EXISTS sender_avatar_seed TEXT;

-- Backfill existing trip_messages from profiles (one-time UPDATE, runs once)
UPDATE public.trip_messages tm
SET    sender_avatar_seed = p.avatar_seed
FROM   public.profiles p
WHERE  p.id = tm.sender_user_id
  AND  tm.sender_user_id IS NOT NULL
  AND  tm.sender_avatar_seed IS NULL;

-- Backfill existing network_messages
UPDATE public.network_messages nm
SET    sender_avatar_seed = p.avatar_seed
FROM   public.profiles p
WHERE  p.id = nm.sender_user_id
  AND  nm.sender_user_id IS NOT NULL
  AND  nm.sender_avatar_seed IS NULL;


-- ─── 4. TRIGGER: auto-populate sender_avatar_seed on INSERT ──────────────────
--
-- Populates sender_avatar_seed from profiles when a new message is inserted
-- with a sender_user_id. One extra PK lookup per INSERT (negligible vs heap fetch
-- savings on every SELECT).
-- Falls through silently if no profile exists yet (driver not yet onboarded).

CREATE OR REPLACE FUNCTION public.fn_populate_sender_avatar_seed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.sender_user_id IS NOT NULL AND NEW.sender_avatar_seed IS NULL THEN
    SELECT avatar_seed
    INTO   NEW.sender_avatar_seed
    FROM   public.profiles
    WHERE  id = NEW.sender_user_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_trip_messages_avatar_seed ON public.trip_messages;
CREATE TRIGGER trg_trip_messages_avatar_seed
  BEFORE INSERT ON public.trip_messages
  FOR EACH ROW EXECUTE FUNCTION public.fn_populate_sender_avatar_seed();

DROP TRIGGER IF EXISTS trg_network_messages_avatar_seed ON public.network_messages;
CREATE TRIGGER trg_network_messages_avatar_seed
  BEFORE INSERT ON public.network_messages
  FOR EACH ROW EXECUTE FUNCTION public.fn_populate_sender_avatar_seed();
