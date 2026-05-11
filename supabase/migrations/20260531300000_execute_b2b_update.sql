-- ─────────────────────────────────────────────────────────────────────────────
-- execute_b2b_update — canonical name for the atomic B2B event writer
--
-- Thin wrapper over process_b2b_event (20260531200000).  Exists so callers
-- can use either name; both are fully equivalent.
--
-- One atomic transaction:
--   1. Validates org ownership of the trip.
--   2. Updates trips.status / driver_id / vehicle_id as supplied in payload.
--   3. Inserts a trip_messages row with the full trip-state snapshot in metadata.
--   4. Routes by event_type: ledger→client+supplier, tracking→driver, else broadcast.
--
-- Payload (JSONB) keys:
--   content          TEXT  — human-readable description (required)
--   new_status       TEXT  — if supplied, trips.status is updated
--   driver_id        UUID  — if supplied, trips.driver_id is updated
--   vehicle_id       UUID  — if supplied, trips.vehicle_id is updated
--   user_id          UUID  — triggering user
--   user_name        TEXT  — display name (default 'System')
--   conversation_id  UUID  — targeted insert (null = route by event_type)
--   extra_meta       JSONB — merged verbatim into message metadata
--
-- Recognised event_type values:
--   status_change  — trip lifecycle (broadcast to all conversations)
--   system         — operational log (broadcast)
--   system_log     — alias for system
--   ledger         — payment event (client + supplier only)
--   ledger_event   — alias for ledger
--   payment        — alias for ledger
--   tracking       — live location (driver conversation only)
--   document_share — document notification (broadcast)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.execute_b2b_update(
  p_organization_id  UUID,
  p_trip_id          UUID,
  p_event_type       TEXT,
  p_payload          JSONB DEFAULT '{}'
)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  -- Normalise caller-facing aliases before forwarding to the canonical function.
  -- system_log → system   |  payment → ledger   |  feedback → feedback_request
  SELECT public.process_b2b_event(
    p_organization_id,
    p_trip_id,
    CASE p_event_type
      WHEN 'system_log' THEN 'system'
      WHEN 'payment'    THEN 'ledger'
      WHEN 'feedback'   THEN 'feedback_request'
      ELSE p_event_type
    END,
    p_payload
  );
$$;

REVOKE ALL ON FUNCTION public.execute_b2b_update(UUID, UUID, TEXT, JSONB) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.execute_b2b_update(UUID, UUID, TEXT, JSONB) TO authenticated;

COMMENT ON FUNCTION public.execute_b2b_update IS
  'Canonical B2B event writer. Thin alias for process_b2b_event with '
  'normalised event_type aliases (system_log→system, payment→ledger, etc.). '
  'One DB round-trip: updates trips state + inserts message with full '
  'trip_state snapshot so clients never need a follow-up fetch.';


-- ─────────────────────────────────────────────────────────────────────────────
-- process_b2b_event: handle system_log / payment / feedback aliases natively
-- ─────────────────────────────────────────────────────────────────────────────
-- Patch the routing inside process_b2b_event so it also understands the alias
-- types in case it is called directly (not via execute_b2b_update).

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
  v_canonical   TEXT;  -- normalised event type used for routing
BEGIN
  SET LOCAL statement_timeout = '8s';
  v_now       := clock_timestamp();
  -- Normalise aliases so routing logic is centralised here
  v_canonical := CASE p_event_type
    WHEN 'system_log'  THEN 'system'
    WHEN 'payment'     THEN 'ledger'
    WHEN 'feedback'    THEN 'feedback_request'
    ELSE p_event_type
  END;

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

  SELECT t.* INTO v_trip FROM public.trips t WHERE t.id = p_trip_id;

  -- ── 3. Full trip-state snapshot ─────────────────────────────────────────────
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
  v_sender_role := CASE v_canonical
    WHEN 'tracking'                 THEN 'driver'
    WHEN 'ledger', 'ledger_event'   THEN 'dispatcher'
    ELSE                                 'system'
  END;

  v_msg_meta := jsonb_build_object(
    'event_type',      p_event_type,   -- keep original name for client logging
    'previous_status', v_prev_status,
    'new_status',      v_new_status,
    'changed_by',      v_user_id,
    'changed_by_name', v_user_name,
    'changed_at',      to_char(v_now AT TIME ZONE 'UTC',
                               'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'trip_state',      v_trip_state
  ) || COALESCE(p_payload->'extra_meta', '{}');

  -- ── 5. Route message inserts ────────────────────────────────────────────────
  IF v_conv_id IS NOT NULL THEN
    INSERT INTO public.trip_messages (
      conversation_id, organization_id,
      sender_user_id, sender_role, sender_name,
      content, message_type, metadata, is_read, is_delivered
    ) VALUES (
      v_conv_id, p_organization_id,
      v_user_id, v_sender_role, v_user_name,
      v_content, v_canonical, v_msg_meta, TRUE, TRUE
    ) RETURNING id INTO v_new_id;
    v_message_ids := array_append(v_message_ids, v_new_id);

  ELSIF v_canonical IN ('ledger', 'ledger_event') THEN
    FOR v_new_id IN
      INSERT INTO public.trip_messages (
        conversation_id, organization_id,
        sender_user_id, sender_role, sender_name,
        content, message_type, metadata, is_read, is_delivered
      )
      SELECT tc.id, tc.organization_id,
             v_user_id, v_sender_role, v_user_name,
             v_content, v_canonical, v_msg_meta, TRUE, TRUE
      FROM   public.trip_conversations tc
      WHERE  tc.trip_id    = p_trip_id
        AND  tc.party_type IN ('client', 'supplier')
      RETURNING id
    LOOP
      v_message_ids := array_append(v_message_ids, v_new_id);
    END LOOP;

  ELSIF v_canonical = 'tracking' THEN
    FOR v_new_id IN
      INSERT INTO public.trip_messages (
        conversation_id, organization_id,
        sender_user_id, sender_role, sender_name,
        content, message_type, metadata, is_read, is_delivered
      )
      SELECT tc.id, tc.organization_id,
             v_user_id, v_sender_role, v_user_name,
             v_content, v_canonical, v_msg_meta, TRUE, TRUE
      FROM   public.trip_conversations tc
      WHERE  tc.trip_id    = p_trip_id
        AND  tc.party_type = 'driver'
      RETURNING id
    LOOP
      v_message_ids := array_append(v_message_ids, v_new_id);
    END LOOP;

  ELSE
    FOR v_new_id IN
      INSERT INTO public.trip_messages (
        conversation_id, organization_id,
        sender_user_id, sender_role, sender_name,
        content, message_type, metadata, is_read, is_delivered
      )
      SELECT tc.id, tc.organization_id,
             v_user_id, v_sender_role, v_user_name,
             v_content, v_canonical, v_msg_meta, TRUE, TRUE
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
    'event_type',  v_canonical
  );
END;
$$;
