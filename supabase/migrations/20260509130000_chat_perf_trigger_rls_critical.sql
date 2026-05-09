-- ============================================================
-- CRITICAL MESSAGING PERFORMANCE FIXES — 2026-05-09
-- Root causes of DB instability:
--
-- 1. TRIGGER AVALANCHE: every trips.status UPDATE fires
--    fn_post_system_message_to_trip_chats which calls
--    send_trip_chat_message() per conversation — that RPC runs
--    8 queries + 2 INSERTs + 2 trigger-UPDATEs each. A trip with
--    3 conversations generates ~30 sync DB ops per status change.
--    Fix: replace with direct INSERT (no auth machinery, no mirror
--    round-trip overhead for system events, inline mirror lookup).
--
-- 2. MISSING INDEXES on hot paths in trigger + RLS:
--    trips(organization_id, trip_number) — full scan on every
--    cross-org message mirror lookup.
--    drivers(user_id) — full scan on driver RLS policy per row.
--    organization_members(user_id) plain — partial index does not
--    serve queries without the status = 'active' filter.
--
-- 3. NON-SARGABLE RLS: COALESCE(om.status,'active')='active' wraps
--    a column in a function — no index can be used. Six policies
--    affected. Fix: (om.status = 'active' OR om.status IS NULL).
--
-- 4. BASE RLS uses IN (subquery) instead of EXISTS — forces full
--    subquery materialisation before row filtering.
--
-- 5. BROKEN PARTIAL INDEX: idx_dq_accepted_bidder_indent uses
--    lower(trim(coalesce(status,'')))='accepted' as predicate —
--    no query using plain status = 'accepted' can use it.
--
-- All changes are safe: IF NOT EXISTS / OR REPLACE / DROP IF EXISTS.
-- ============================================================

-- ── 1. Missing indexes ────────────────────────────────────────────────────────

-- trips(organization_id, trip_number):
-- Used in every cross-org mirror lookup inside send_trip_chat_message:
--   SELECT * FROM trips WHERE organization_id = ? AND trip_number = ?
-- Without this, every dispatcher message send scans the whole trips table
-- for the partner org. Also used in the new inline mirror inside
-- fn_post_system_message_to_trip_chats below.
CREATE INDEX IF NOT EXISTS idx_trips_org_trip_number
  ON public.trips(organization_id, trip_number);

-- drivers(user_id):
-- Used in every RLS policy that checks if auth.uid() is a driver, and in
-- send_trip_chat_message auth branch. Without this, every message INSERT/SELECT
-- on trip_messages does a full drivers table scan per row evaluated.
CREATE INDEX IF NOT EXISTS idx_drivers_user_id
  ON public.drivers(user_id) WHERE user_id IS NOT NULL;

-- organization_members(user_id) — plain, no partial predicate:
-- The existing idx_org_members_user_org_status is partial (WHERE status='active')
-- and cannot serve queries that need all statuses or use COALESCE(status,'active').
-- This plain index serves the base RLS policies and the auth check in
-- send_trip_chat_message before status filtering.
CREATE INDEX IF NOT EXISTS idx_org_members_user_id_plain
  ON public.organization_members(user_id);

-- trip_conversations(trip_id, party_type):
-- Used in fn_ensure_trip_party_conversations upsert (ON CONFLICT trip_id,party_type)
-- and in the new inline mirror lookup in fn_post_system_message_to_trip_chats.
-- The unique constraint on (trip_id, party_type) creates an implicit index, but an
-- explicit covering index gives the planner a second access path for range queries.
CREATE INDEX IF NOT EXISTS idx_trip_conversations_trip_party
  ON public.trip_conversations(trip_id, party_type);

-- network_messages(conversation_id, is_read_by_other) for bulk mark-read:
-- mark_network_conversation_read updates WHERE conversation_id = ? AND
-- sender_org_id <> ? AND is_read_by_other = FALSE. Without this, it scans
-- all messages in the conversation to find unread ones.
CREATE INDEX IF NOT EXISTS idx_network_messages_conv_unread
  ON public.network_messages(conversation_id, is_read_by_other)
  WHERE is_read_by_other = FALSE;

-- ── 2. Drop broken partial index ─────────────────────────────────────────────

-- idx_dq_accepted_bidder_indent (migration 20260504180000) uses
-- lower(trim(coalesce(status,'')))='accepted' as its partial predicate.
-- This function-wrapped expression means NO query using plain dq.status = 'accepted'
-- can use this index. The correct replacement (idx_direct_quotes_accepted_indent
-- with WHERE status = 'accepted') was created in migration 20260506110000.
DROP INDEX IF EXISTS public.idx_dq_accepted_bidder_indent;

-- ── 3. Fix base RLS policies: IN (subquery) → EXISTS ─────────────────────────

-- The original policies materialise the full org set before filtering each row.
-- EXISTS with a correlated predicate lets PostgreSQL stop at the first match and
-- use idx_org_members_user_org_status (covering index user_id, org_id WHERE active).

DROP POLICY IF EXISTS "organization_members_can_manage_trip_conversations" ON public.trip_conversations;
CREATE POLICY "organization_members_can_manage_trip_conversations"
  ON public.trip_conversations
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.user_id    = auth.uid()
        AND om.organization_id = trip_conversations.organization_id
        AND (om.status = 'active' OR om.status IS NULL)
    )
  );

DROP POLICY IF EXISTS "organization_members_can_manage_trip_messages" ON public.trip_messages;
CREATE POLICY "organization_members_can_manage_trip_messages"
  ON public.trip_messages
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.user_id    = auth.uid()
        AND om.organization_id = trip_messages.organization_id
        AND (om.status = 'active' OR om.status IS NULL)
    )
  );

-- ── 4. Fix non-sargable COALESCE in supplier RLS policies ─────────────────────

-- COALESCE(om.status, 'active') = 'active' wraps om.status in a function call.
-- PostgreSQL cannot push a function-wrapped column into an index scan, so every
-- row evaluation does a heap lookup and applies the function — even with indexes.
-- Replace with (om.status = 'active' OR om.status IS NULL) which is index-friendly.

-- Policy A: Linked supplier org reads trip conversations for supplied trips
DROP POLICY IF EXISTS "Linked supplier org reads trip conversations for supplied trips"
  ON public.trip_conversations;
CREATE POLICY "Linked supplier org reads trip conversations for supplied trips"
  ON public.trip_conversations
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM   public.trips t
      JOIN   public.suppliers s ON s.id = t.supplier_id
      JOIN   public.organization_members om
               ON om.user_id         = auth.uid()
              AND om.organization_id  = s.linked_organization_id
              AND (om.status = 'active' OR om.status IS NULL)
      WHERE  t.id = trip_conversations.trip_id
    )
    OR EXISTS (
      SELECT 1
      FROM   public.trips t
      JOIN   public.indents i  ON i.id = t.indent_id
      JOIN   public.direct_quotes dq
               ON dq.indent_id = i.id AND dq.status = 'accepted'
      JOIN   public.organization_members om
               ON om.user_id        = auth.uid()
              AND om.organization_id = dq.bidder_organization_id
              AND (om.status = 'active' OR om.status IS NULL)
      WHERE  t.id = trip_conversations.trip_id
        AND  t.indent_id IS NOT NULL
    )
  );

-- Policy B: Linked supplier org reads trip messages for supplied trips
DROP POLICY IF EXISTS "Linked supplier org reads trip messages for supplied trips"
  ON public.trip_messages;
CREATE POLICY "Linked supplier org reads trip messages for supplied trips"
  ON public.trip_messages
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM   public.trip_conversations tc
      JOIN   public.trips t ON t.id = tc.trip_id
      JOIN   public.suppliers s ON s.id = t.supplier_id
      JOIN   public.organization_members om
               ON om.user_id        = auth.uid()
              AND om.organization_id = s.linked_organization_id
              AND (om.status = 'active' OR om.status IS NULL)
      WHERE  tc.id = trip_messages.conversation_id
    )
    OR EXISTS (
      SELECT 1
      FROM   public.trip_conversations tc
      JOIN   public.trips t ON t.id = tc.trip_id
      JOIN   public.indents i  ON i.id = t.indent_id
      JOIN   public.direct_quotes dq
               ON dq.indent_id = i.id AND dq.status = 'accepted'
      JOIN   public.organization_members om
               ON om.user_id        = auth.uid()
              AND om.organization_id = dq.bidder_organization_id
              AND (om.status = 'active' OR om.status IS NULL)
      WHERE  tc.id = trip_messages.conversation_id
        AND  t.indent_id IS NOT NULL
    )
  );

-- Policy C: Linked supplier org inserts supplier party messages
DROP POLICY IF EXISTS "Linked supplier org inserts supplier party messages"
  ON public.trip_messages;
CREATE POLICY "Linked supplier org inserts supplier party messages"
  ON public.trip_messages
  FOR INSERT
  WITH CHECK (
    sender_role = 'supplier'
    AND organization_id = (
      SELECT tc.organization_id
      FROM   public.trip_conversations tc
      WHERE  tc.id = trip_messages.conversation_id
    )
    AND (
      EXISTS (
        SELECT 1
        FROM   public.trip_conversations tc
        JOIN   public.trips t ON t.id = tc.trip_id
        JOIN   public.suppliers s
                 ON s.id = t.supplier_id AND s.id = tc.supplier_id
        JOIN   public.organization_members om
                 ON om.user_id        = auth.uid()
                AND om.organization_id = s.linked_organization_id
                AND (om.status = 'active' OR om.status IS NULL)
        WHERE  tc.id = trip_messages.conversation_id
          AND  tc.party_type = 'supplier'
      )
      OR EXISTS (
        SELECT 1
        FROM   public.trip_conversations tc
        JOIN   public.trips t ON t.id = tc.trip_id
        JOIN   public.indents i  ON i.id = t.indent_id
        JOIN   public.direct_quotes dq
                 ON dq.indent_id = i.id AND dq.status = 'accepted'
        JOIN   public.organization_members om
                 ON om.organization_id = dq.bidder_organization_id
                AND om.user_id         = auth.uid()
                AND (om.status = 'active' OR om.status IS NULL)
        WHERE  tc.id = trip_messages.conversation_id
          AND  tc.party_type = 'supplier'
          AND  t.indent_id IS NOT NULL
          AND  tc.supplier_id IS NOT NULL
          AND  EXISTS (
            SELECT 1 FROM public.suppliers s2
            WHERE  s2.id = tc.supplier_id
              AND  s2.linked_organization_id = dq.bidder_organization_id
          )
      )
    )
  );

-- ── 5. Replace fn_post_system_message_to_trip_chats ──────────────────────────
--
-- CURRENT (BAD): calls send_trip_chat_message() per non-driver conversation.
-- That RPC runs: auth check (3 queries), trip fetch (1), linked-org fetch (1),
-- partner trip lookup (1 full scan fixed by idx_trips_org_trip_number), partner
-- conversation lookup (1), source INSERT (1 + trigger UPDATE), mirror INSERT
-- (1 + trigger UPDATE). Total: 8+ queries + 2 INSERTs + 2 UPDATEs per call.
-- For 3 conversations on one trip: ~30 DB ops per trip status change.
--
-- NEW (FAST): direct INSERT for both source and mirror conversations.
-- No auth machinery (SECURITY DEFINER), trip data fetched once at top of function,
-- mirror lookup uses the new idx_trips_org_trip_number and idx_trip_conversations_trip_party.
-- Total: ~5 ops per conversation = ~15 ops for 3 conversations (50% reduction).

CREATE OR REPLACE FUNCTION public.fn_post_system_message_to_trip_chats(
  p_trip_id       UUID,
  p_content       TEXT,
  p_dedupe_status TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conv          RECORD;
  v_meta          JSONB;
  v_source_trip   RECORD;
  v_partner_org   UUID;
  v_partner_trip  RECORD;
  v_partner_conv  UUID;
BEGIN
  -- Build metadata once (avoids repeated jsonb_build_object calls in the loop)
  v_meta := jsonb_build_object(
    'trip_status_broadcast', '1',
    'status', COALESCE(p_dedupe_status, '')
  );

  -- Fetch source trip once (PK lookup — O(1))
  SELECT id, organization_id, trip_number, client_id, supplier_id
  INTO   v_source_trip
  FROM   public.trips
  WHERE  id = p_trip_id;

  IF NOT FOUND THEN RETURN; END IF;

  FOR v_conv IN
    SELECT id, party_type, organization_id, client_id, supplier_id
    FROM   public.trip_conversations
    WHERE  trip_id = p_trip_id
  LOOP

    -- Dedup: skip if this status was already broadcast.
    -- Uses idx_trip_messages_conv_type (conversation_id, message_type, created_at DESC).
    IF p_dedupe_status IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.trip_messages tm
      WHERE  tm.conversation_id = v_conv.id
        AND  tm.message_type    = 'system'
        AND  (tm.metadata->>'trip_status_broadcast') = '1'
        AND  (tm.metadata->>'status') = trim(p_dedupe_status)
      LIMIT 1
    ) THEN
      CONTINUE;
    END IF;

    -- Direct INSERT into source conversation.
    -- sync_conversation_on_message trigger fires and updates last_message_at/unread — intentional.
    INSERT INTO public.trip_messages (
      conversation_id,  organization_id,     sender_user_id,
      sender_role,      sender_name,         content,
      message_type,     is_read,             metadata
    ) VALUES (
      v_conv.id,        v_conv.organization_id, NULL,
      'system',         'Trip System',          p_content,
      'system',         FALSE,                  v_meta
    );

    -- Mirror to linked partner org (client/supplier threads only).
    -- Driver conversations are org-local and do not mirror.
    v_partner_org := NULL;

    IF v_conv.party_type = 'client' AND v_conv.client_id IS NOT NULL THEN
      SELECT linked_organization_id INTO v_partner_org
      FROM   public.clients
      WHERE  id = v_conv.client_id;

    ELSIF v_conv.party_type = 'supplier' AND v_conv.supplier_id IS NOT NULL THEN
      SELECT linked_organization_id INTO v_partner_org
      FROM   public.suppliers
      WHERE  id = v_conv.supplier_id;
    END IF;

    IF v_partner_org IS NULL THEN
      CONTINUE;
    END IF;

    -- Find the partner org's mirrored trip.
    -- Uses new idx_trips_org_trip_number (organization_id, trip_number).
    SELECT id, organization_id INTO v_partner_trip
    FROM   public.trips
    WHERE  organization_id = v_partner_org
      AND  trip_number     = v_source_trip.trip_number
    ORDER BY created_at DESC
    LIMIT 1;

    IF NOT FOUND THEN CONTINUE; END IF;

    -- Find the partner org's conversation for the same party type.
    -- Uses idx_trip_conversations_trip_party (trip_id, party_type).
    SELECT id INTO v_partner_conv
    FROM   public.trip_conversations
    WHERE  trip_id    = v_partner_trip.id
      AND  party_type = v_conv.party_type
    LIMIT 1;

    IF v_partner_conv IS NULL THEN CONTINUE; END IF;

    -- Dedup for the partner conversation
    IF p_dedupe_status IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.trip_messages tm
      WHERE  tm.conversation_id = v_partner_conv
        AND  tm.message_type    = 'system'
        AND  (tm.metadata->>'trip_status_broadcast') = '1'
        AND  (tm.metadata->>'status') = trim(p_dedupe_status)
      LIMIT 1
    ) THEN
      CONTINUE;
    END IF;

    INSERT INTO public.trip_messages (
      conversation_id,  organization_id,           sender_user_id,
      sender_role,      sender_name,               content,
      message_type,     is_read,                   metadata
    ) VALUES (
      v_partner_conv,   v_partner_trip.organization_id, NULL,
      'system',         'Trip System',                  p_content,
      'system',         FALSE,                          v_meta
    );

  END LOOP;
END;
$$;

-- ── 6. Guard fn_broadcast_trip_status_to_chat against no-op UPDATEs ──────────
--
-- When other columns on trips are updated (e.g. updated_at, amounts, notes),
-- PostgreSQL can still fire the trigger if the UPDATE statement touched the
-- status column even when its value didn't change. The early-exit guard
-- prevents the entire chain from running in that case.

CREATE OR REPLACE FUNCTION public.fn_broadcast_trip_status_to_chat()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_msg      TEXT;
  v_terminal BOOLEAN;
BEGIN
  -- No-op guard: skip if status did not actually change.
  IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  v_msg := public.fn_trip_status_chat_message_body(NEW);
  -- fn_trip_status_chat_message_body returns NULL for statuses we don't announce
  IF v_msg IS NULL THEN
    RETURN NEW;
  END IF;

  v_terminal := NEW.status IN ('completed', 'delivered', 'done', 'cancelled');

  -- Ensure party conversations exist (fast: ON CONFLICT on unique idx trip_id+party_type)
  PERFORM public.fn_ensure_trip_party_conversations(NEW.id);

  -- Broadcast to all conversations for this trip
  IF EXISTS (SELECT 1 FROM public.trip_conversations WHERE trip_id = NEW.id LIMIT 1) THEN
    PERFORM public.fn_post_system_message_to_trip_chats(NEW.id, v_msg, NEW.status::text);
  END IF;

  -- Post feedback prompts on terminal status (dedup handled inside that function)
  IF v_terminal THEN
    PERFORM public.fn_post_trip_feedback_prompt_to_chats(NEW.id);
  END IF;

  RETURN NEW;
END;
$$;

-- ── 7. Fix get_supplier_trip_ids_for_org: add LIMIT ───────────────────────────
--
-- The current function has no LIMIT on the aggregate — a large organisation
-- can return thousands of trip IDs, bloating the response and the app-side
-- IN (…) clause that consumes them.

CREATE OR REPLACE FUNCTION public.get_supplier_trip_ids_for_org(p_org_id uuid)
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    json_agg(trip_id ORDER BY trip_id),
    '[]'::json
  )
  FROM (
    SELECT DISTINCT t.id AS trip_id
    FROM   public.trips t
    JOIN   public.suppliers s ON s.id = t.supplier_id
    WHERE  s.linked_organization_id = p_org_id
      AND  t.status NOT IN ('cancelled')
    ORDER BY t.id
    LIMIT 500
  ) sub;
$$;

GRANT EXECUTE ON FUNCTION public.get_supplier_trip_ids_for_org(uuid) TO authenticated;
