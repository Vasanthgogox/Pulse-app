-- ─────────────────────────────────────────────────────────────────────────────
-- process_b2b_event — unified atomic B2B event writer
--
-- Replaces 3-4 separate network calls (update status, insert message ×N convs,
-- re-fetch trip) with ONE transaction that:
--   1. Validates org access.
--   2. Locks + updates trips row (status, driver, vehicle).
--   3. Takes a full trip-state snapshot at the point of update.
--   4. Inserts one trip_messages row per target conversation — with the full
--      snapshot embedded in metadata.trip_state so the client NEVER needs a
--      follow-up DB fetch.
--   5. Routes messages by event_type:
--        ledger / ledger_event  → only client + supplier conversations
--        tracking               → only driver conversation
--        status_change / system → broadcast to all conversations
--        (explicit conversation_id in payload overrides all routing)
--   6. Returns { ok, message_ids, trip_state, prev_status, new_status }.
--
-- Payload keys (all optional except content):
--   content          TEXT   — human-readable event description
--   new_status       TEXT   — if present, trips.status is updated
--   driver_id        UUID   — if present, trips.driver_id is updated
--   vehicle_id       UUID   — if present, trips.vehicle_id is updated
--   user_id          UUID   — triggering user
--   user_name        TEXT   — display name (default: 'System')
--   conversation_id  UUID   — targeted insert; NULL = route by event_type
--   extra_meta       JSONB  — merged into message metadata verbatim
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.process_b2b_event(
  p_organization_id  UUID,
  p_trip_id          UUID,
  p_event_type       TEXT,
  p_payload          JSONB DEFAULT '{}'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trip        RECORD;
  v_prev_status TEXT;
  v_new_status  TEXT;
  v_content     TEXT;
  v_user_id     UUID;
  v_user_name   TEXT;
  v_conv_id     UUID;
  v_new_id      UUID;
  v_message_ids UUID[]    := '{}';
  v_trip_state  JSONB;
  v_msg_meta    JSONB;
  v_sender_role TEXT;
  v_now         TIMESTAMPTZ;

  -- Party-type routing: which conversations get this message type
  v_party_filter TEXT[];   -- NULL = broadcast, else restrict to these party_types
BEGIN
  -- Hard cap on function run time — prevents any single event from hanging the DB
  SET LOCAL statement_timeout = '8s';

  v_now := clock_timestamp();

  -- ── 1. Validate + lock ──────────────────────────────────────────────────────
  SELECT t.* INTO v_trip
  FROM   public.trips t
  WHERE  t.id = p_trip_id
    AND (
      t.organization_id = p_organization_id
      OR EXISTS (
        SELECT 1 FROM public.suppliers s
        WHERE  s.id                    = t.supplier_id
          AND  s.linked_organization_id = p_organization_id
      )
    )
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'process_b2b_event: trip % not accessible for org %',
      p_trip_id, p_organization_id
    USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_prev_status := v_trip.status;
  v_new_status  := COALESCE(p_payload->>'new_status', v_prev_status);
  v_content     := COALESCE(NULLIF(trim(p_payload->>'content'), ''), 'System update');
  v_user_id     := NULLIF(p_payload->>'user_id', '')::UUID;
  v_user_name   := COALESCE(NULLIF(p_payload->>'user_name', ''), 'System');
  v_conv_id     := NULLIF(p_payload->>'conversation_id', '')::UUID;

  -- ── 2. Apply trip mutations ─────────────────────────────────────────────────
  -- Only touch columns that are explicitly supplied in the payload.
  UPDATE public.trips
  SET
    status     = v_new_status,
    driver_id  = CASE WHEN p_payload ? 'driver_id'
                      THEN NULLIF(p_payload->>'driver_id', '')::UUID
                      ELSE driver_id  END,
    vehicle_id = CASE WHEN p_payload ? 'vehicle_id'
                      THEN NULLIF(p_payload->>'vehicle_id', '')::UUID
                      ELSE vehicle_id END,
    updated_at = v_now
  WHERE id = p_trip_id;

  -- Re-read so trip_state reflects the mutations above.
  SELECT t.* INTO v_trip FROM public.trips t WHERE t.id = p_trip_id;

  -- ── 3. Full trip-state snapshot (embedded in every message) ─────────────────
  v_trip_state := jsonb_build_object(
    'id',                     v_trip.id,
    'trip_number',            v_trip.trip_number,
    'display_trip_id',        v_trip.display_trip_id,
    'status',                 v_trip.status,
    'driver_id',              v_trip.driver_id,
    'vehicle_id',             v_trip.vehicle_id,
    'supplier_id',            v_trip.supplier_id,
    'client_id',              v_trip.client_id,
    'driver_display_name',    v_trip.driver_display_name,
    'vehicle_display_number', v_trip.vehicle_display_number,
    'pickup_area',            v_trip.pickup_area,
    'drop_location',          v_trip.drop_location,
    'pickup_date',            v_trip.pickup_date,
    'payment_status',         v_trip.payment_status,
    'updated_at',             to_char(v_now AT TIME ZONE 'UTC',
                                      'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  );

  -- ── 4. Build message metadata ───────────────────────────────────────────────
  v_sender_role := CASE p_event_type
    WHEN 'tracking'                   THEN 'driver'
    WHEN 'ledger' , 'ledger_event'    THEN 'dispatcher'
    ELSE                                   'system'
  END;

  v_msg_meta := jsonb_build_object(
    'event_type',      p_event_type,
    'previous_status', v_prev_status,
    'new_status',      v_new_status,
    'changed_by',      v_user_id,
    'changed_by_name', v_user_name,
    'changed_at',      to_char(v_now AT TIME ZONE 'UTC',
                               'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'trip_state',      v_trip_state
  ) || COALESCE(p_payload->'extra_meta', '{}');

  -- ── 5. Determine conversation routing ──────────────────────────────────────
  --   Explicit conversation_id always wins; otherwise route by event_type.
  --   This keeps ledger events out of the driver's thread and tracking out
  --   of financial threads — reducing per-message Realtime fan-out.

  IF v_conv_id IS NOT NULL THEN
    -- ── 5a. Targeted: single conversation ────────────────────────────────────
    INSERT INTO public.trip_messages (
      conversation_id, organization_id,
      sender_user_id, sender_role, sender_name,
      content, message_type, metadata,
      is_read, is_delivered
    ) VALUES (
      v_conv_id,       p_organization_id,
      v_user_id, v_sender_role, v_user_name,
      v_content, p_event_type,  v_msg_meta,
      TRUE, TRUE
    )
    RETURNING id INTO v_new_id;
    v_message_ids := array_append(v_message_ids, v_new_id);

  ELSIF p_event_type IN ('ledger', 'ledger_event') THEN
    -- ── 5b. Financial events: client + supplier tabs only ─────────────────────
    FOR v_new_id IN
      INSERT INTO public.trip_messages (
        conversation_id, organization_id,
        sender_user_id, sender_role, sender_name,
        content, message_type, metadata,
        is_read, is_delivered
      )
      SELECT tc.id, tc.organization_id,
             v_user_id, v_sender_role, v_user_name,
             v_content, p_event_type,  v_msg_meta,
             TRUE, TRUE
      FROM   public.trip_conversations tc
      WHERE  tc.trip_id    = p_trip_id
        AND  tc.party_type IN ('client', 'supplier')
      RETURNING id
    LOOP
      v_message_ids := array_append(v_message_ids, v_new_id);
    END LOOP;

  ELSIF p_event_type = 'tracking' THEN
    -- ── 5c. Location events: driver tab only ──────────────────────────────────
    FOR v_new_id IN
      INSERT INTO public.trip_messages (
        conversation_id, organization_id,
        sender_user_id, sender_role, sender_name,
        content, message_type, metadata,
        is_read, is_delivered
      )
      SELECT tc.id, tc.organization_id,
             v_user_id, v_sender_role, v_user_name,
             v_content, p_event_type,  v_msg_meta,
             TRUE, TRUE
      FROM   public.trip_conversations tc
      WHERE  tc.trip_id    = p_trip_id
        AND  tc.party_type = 'driver'
      RETURNING id
    LOOP
      v_message_ids := array_append(v_message_ids, v_new_id);
    END LOOP;

  ELSE
    -- ── 5d. Broadcast: all conversations for the trip ─────────────────────────
    FOR v_new_id IN
      INSERT INTO public.trip_messages (
        conversation_id, organization_id,
        sender_user_id, sender_role, sender_name,
        content, message_type, metadata,
        is_read, is_delivered
      )
      SELECT tc.id, tc.organization_id,
             v_user_id, v_sender_role, v_user_name,
             v_content, p_event_type,  v_msg_meta,
             TRUE, TRUE
      FROM   public.trip_conversations tc
      WHERE  tc.trip_id = p_trip_id
      RETURNING id
    LOOP
      v_message_ids := array_append(v_message_ids, v_new_id);
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'ok',          TRUE,
    'message_ids', v_message_ids,
    'trip_state',  v_trip_state,
    'prev_status', v_prev_status,
    'new_status',  v_new_status,
    'event_type',  p_event_type
  );
END;
$$;

REVOKE ALL ON FUNCTION public.process_b2b_event(UUID, UUID, TEXT, JSONB) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.process_b2b_event(UUID, UUID, TEXT, JSONB) TO authenticated;

COMMENT ON FUNCTION public.process_b2b_event IS
  'Atomic B2B event writer: locks trip, applies mutation, embeds full trip-state '
  'snapshot in message metadata, routes to correct conversation subset. '
  'Eliminates 3-4 round-trips; client extracts trip_state from the Realtime '
  'INSERT and updates in-memory store with no follow-up fetch.';


-- ─────────────────────────────────────────────────────────────────────────────
-- WhatsApp-style priority sort index
--
-- Supports sidebar ordering: conversations with unread messages appear first,
-- then sorted by most-recent activity within each bucket.
--
-- Query pattern:
--   ORDER BY (unread_dispatcher_count > 0) DESC, last_message_at DESC NULLS LAST
-- ─────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_tc_priority_sort
  ON public.trip_conversations (
    organization_id,
    (unread_dispatcher_count > 0) DESC,
    last_message_at DESC NULLS LAST
  );

-- Supporting index for the trip_messages side of the priority sort —
-- used when get_initial_chat_state orders the inner message pages.
CREATE INDEX IF NOT EXISTS idx_tm_priority_sort
  ON public.trip_messages (organization_id, created_at DESC);


-- ─────────────────────────────────────────────────────────────────────────────
-- Connection & timeout hardening
--
-- Problem: a single heavy "Log" update (status change → broadcast insert ×N)
-- previously locked the trips row for the full duration of 3-4 separate client
-- round-trips, holding the lock across network latency. Under burst load this
-- caused lock queuing that turned the DB unhealthy.
--
-- Fix: tighten the statement timeout on the authenticated role so no single
-- user-facing query can exceed 8 s, and tighten the idle-in-transaction limit
-- so abandoned transactions release locks within 5 s instead of 30 s.
--
-- NOTE: SECURITY DEFINER functions (process_b2b_event, submit_business_event)
-- override this via SET LOCAL statement_timeout = '8s' inside the function body.
-- The role-level setting below applies to all other authenticated queries.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER ROLE authenticated
  SET statement_timeout             = '8s';

ALTER ROLE authenticated
  SET idle_in_transaction_session_timeout = '5s';

-- anon role (unauthenticated API calls / public endpoints)
ALTER ROLE anon
  SET statement_timeout             = '5s';

ALTER ROLE anon
  SET idle_in_transaction_session_timeout = '3s';
