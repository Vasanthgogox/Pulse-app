-- ─────────────────────────────────────────────────────────────────────────────
-- submit_business_event — unified atomic event writer
--
-- Replaces ad-hoc multi-step writes (status update + message insert) with a
-- single SECURITY DEFINER function that:
--   1. Verifies the caller's org owns or is a supplier for the trip.
--   2. Optionally updates trips.status in the same transaction.
--   3. Inserts one trip_messages row per target conversation.
--      p_conversation_id = NULL  → broadcast to ALL conversations for the trip
--      p_conversation_id = UUID  → write to that single conversation only
--   4. Returns { ok, message_ids, updated_at, new_status } for direct
--      client-side store patching — the caller never needs a follow-up fetch.
--
-- Supported event types (p_event_type maps to message_type column):
--   status_change  — trip lifecycle update; broadcast to all conversations
--   system         — operational log; broadcast or targeted
--   ledger         — payment event; targeted to client/finance conversation
--   tracking       — live location push; targeted to driver conversation
--   document_share — document notification; targeted or broadcast
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.submit_business_event(
  p_organization_id  UUID,
  p_trip_id          UUID,
  p_event_type       TEXT,
  p_content          TEXT,
  p_metadata         JSONB DEFAULT '{}',
  p_new_trip_status  TEXT  DEFAULT NULL,
  p_user_id          UUID  DEFAULT NULL,
  p_user_name        TEXT  DEFAULT 'System',
  p_conversation_id  UUID  DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prev_status  TEXT;
  v_updated_at   TEXT;
  v_message_ids  UUID[] := '{}';
  v_new_id       UUID;
  v_sender_role  TEXT;
BEGIN
  -- ── 1. Validate the caller's org can write to this trip ──────────────────
  SELECT status INTO v_prev_status
  FROM   public.trips
  WHERE  id = p_trip_id
    AND (
      organization_id = p_organization_id
      OR EXISTS (
        SELECT 1 FROM public.suppliers s
        WHERE  s.id          = supplier_id
          AND  s.linked_organization_id = p_organization_id
      )
    );

  IF NOT FOUND THEN
    RAISE EXCEPTION 'submit_business_event: trip % not accessible for org %',
      p_trip_id, p_organization_id;
  END IF;

  -- ── 2. Optionally update trip status ─────────────────────────────────────
  IF p_new_trip_status IS NOT NULL AND p_new_trip_status <> v_prev_status THEN
    UPDATE public.trips
    SET    status     = p_new_trip_status,
           updated_at = NOW()
    WHERE  id = p_trip_id;
  END IF;

  v_updated_at := to_char(
    NOW() AT TIME ZONE 'UTC',
    'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
  );

  -- Derive sender_role from event type
  v_sender_role := CASE p_event_type
    WHEN 'tracking' THEN 'driver'
    WHEN 'ledger'   THEN 'dispatcher'
    ELSE                 'system'
  END;

  -- ── 3. Insert message(s) ──────────────────────────────────────────────────
  IF p_conversation_id IS NOT NULL THEN
    -- Targeted: single conversation
    INSERT INTO public.trip_messages (
      conversation_id, organization_id,
      sender_user_id, sender_role, sender_name,
      content, message_type, metadata,
      is_read, is_delivered
    ) VALUES (
      p_conversation_id, p_organization_id,
      p_user_id, v_sender_role, p_user_name,
      p_content, p_event_type, p_metadata,
      TRUE, TRUE
    )
    RETURNING id INTO v_new_id;
    v_message_ids := array_append(v_message_ids, v_new_id);
  ELSE
    -- Broadcast: one message per conversation for this trip
    FOR v_new_id IN
      INSERT INTO public.trip_messages (
        conversation_id, organization_id,
        sender_user_id, sender_role, sender_name,
        content, message_type, metadata,
        is_read, is_delivered
      )
      SELECT
        tc.id,
        tc.organization_id,
        p_user_id,
        v_sender_role,
        p_user_name,
        p_content,
        p_event_type,
        p_metadata,
        TRUE,
        TRUE
      FROM public.trip_conversations tc
      WHERE tc.trip_id = p_trip_id
      RETURNING id
    LOOP
      v_message_ids := array_append(v_message_ids, v_new_id);
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'ok',           TRUE,
    'message_ids',  v_message_ids,
    'updated_at',   v_updated_at,
    'prev_status',  v_prev_status,
    'new_status',   COALESCE(p_new_trip_status, v_prev_status),
    'event_type',   p_event_type
  );
END;
$$;

REVOKE ALL ON FUNCTION public.submit_business_event(UUID, UUID, TEXT, TEXT, JSONB, TEXT, UUID, TEXT, UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.submit_business_event(UUID, UUID, TEXT, TEXT, JSONB, TEXT, UUID, TEXT, UUID) TO authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- Performance indexes
--
-- These make the three hot paths instantaneous:
--   A. Sidebar sort by last activity   → trip_conversations by (org, last_message_at)
--   B. Message list fetch              → trip_messages by (conv, created_at)
--   C. Delivery/seen batch RPC         → trip_messages undelivered/unread rows
-- ─────────────────────────────────────────────────────────────────────────────

-- A. Sidebar: sort conversations by recency within an org
CREATE INDEX IF NOT EXISTS idx_tc_org_activity
  ON public.trip_conversations (organization_id, last_message_at DESC NULLS LAST);

-- B. Message list: paginate messages for a conversation in chronological order
CREATE INDEX IF NOT EXISTS idx_tm_conv_time
  ON public.trip_messages (conversation_id, created_at ASC);

-- C. Delivery/seen batch: narrow scan for the debounced mark_batch_seen RPC
--    Partial index — only covers rows that still need processing.
CREATE INDEX IF NOT EXISTS idx_tm_delivery_pending
  ON public.trip_messages (conversation_id, is_delivered, is_read)
  WHERE is_delivered = FALSE OR is_read = FALSE;

-- D. Unread badge: count unread rows per conversation quickly
CREATE INDEX IF NOT EXISTS idx_tm_unread
  ON public.trip_messages (conversation_id, is_read)
  WHERE is_read = FALSE;

-- E. Realtime filter: messages by org + time for the channel subscription
CREATE INDEX IF NOT EXISTS idx_tm_org_time
  ON public.trip_messages (organization_id, created_at DESC);
