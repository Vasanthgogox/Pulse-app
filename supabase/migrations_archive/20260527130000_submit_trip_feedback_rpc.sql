-- ═════════════════════════════════════════════════════════════════════════════
-- submit_trip_feedback RPC — ATOMIC FEEDBACK TRANSACTION
--
-- ROOT CAUSE (feedback causing DB Unhealthy):
-- The client-side submitTripChatFeedback() makes 3 sequential DB round trips:
--   1. INSERT/UPSERT ratings                   → 1 PostgREST HTTP round trip
--   2. SELECT metadata FROM trip_messages      → 1 PostgREST HTTP round trip
--   3. UPDATE trip_messages SET metadata = ... → 1 PostgREST HTTP round trip
--
-- Under concurrent users, each round trip opens a connection from the pool,
-- runs the query, and releases it. 3 open connections per feedback submit
-- multiplied by simultaneous users collapses the pool.
--
-- Additionally, steps 2+3 are not atomic: a crash between SELECT and UPDATE
-- leaves the rating in `ratings` but the message metadata unstamped — the
-- next load replays the feedback prompt as if nothing was submitted.
--
-- FIX: Single SECURITY DEFINER RPC
--   • 1 connection, 1 round trip for the entire submit operation.
--   • Atomic: both the rating upsert and the metadata stamp succeed or roll back
--     together — no partial state possible.
--   • Idempotency guard: if the message already has submitted_at, returns early
--     without re-writing (safe for re-tries / double-taps).
--   • Eliminates the SELECT: JSONB concatenation (`||`) merges submitted_* keys
--     into the existing metadata in a single UPDATE, no prior read needed.
-- ═════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.submit_trip_feedback(
  p_organization_id  UUID,
  p_trip_id          UUID,
  p_message_id       UUID,
  p_rated_type       TEXT,    -- 'client' | 'supplier' | 'driver'
  p_rated_id         UUID,
  p_score            INT,     -- 1–5
  p_tags             TEXT[]   -- e.g. '{PUNCTUAL,PROFESSIONAL}'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_submitted_at  TEXT;
  v_comment       TEXT;
  v_rows          INT;
BEGIN
  -- Validate score range
  p_score := GREATEST(1, LEAST(5, p_score));

  -- Idempotency: if message already carries submitted_at we are done.
  -- Uses covering index idx_trip_messages_covering (conversation_id, created_at DESC)
  -- but the PK lookup on id is faster — RLS is bypassed (SECURITY DEFINER).
  IF EXISTS (
    SELECT 1
    FROM   public.trip_messages
    WHERE  id = p_message_id
      AND  (metadata->>'submitted_at') IS NOT NULL
  ) THEN
    RETURN jsonb_build_object('error', 'already_submitted');
  END IF;

  -- Build the comment string matching the existing client format:
  -- {"source":"trip_chat_feedback","tags":["PUNCTUAL","PROFESSIONAL"]}
  v_comment := jsonb_build_object(
    'source', 'trip_chat_feedback',
    'tags',   to_jsonb(COALESCE(p_tags, ARRAY[]::TEXT[]))
  )::TEXT;

  -- ── Step 1: Upsert rating ─────────────────────────────────────────────────
  INSERT INTO public.ratings (
    organization_id,   trip_id,      rater_type,
    rater_id,          rated_type,   rated_id,
    score,             comment,      updated_at
  )
  VALUES (
    p_organization_id, p_trip_id,   'organization',
    p_organization_id, p_rated_type, p_rated_id,
    p_score,           v_comment,   now()
  )
  ON CONFLICT (trip_id, rater_type, rater_id, rated_type, rated_id)
  DO UPDATE SET
    score      = EXCLUDED.score,
    comment    = EXCLUDED.comment,
    updated_at = now();

  -- ── Step 2: Stamp message metadata (no prior SELECT required) ────────────
  -- JSONB `||` operator merges submitted_* keys into the existing metadata JSONB.
  -- If metadata IS NULL, COALESCE produces '{}'::JSONB so the concat is safe.
  v_submitted_at := to_char(
    now() AT TIME ZONE 'UTC',
    'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
  );

  UPDATE public.trip_messages
  SET    metadata = COALESCE(metadata, '{}'::JSONB)
                    || jsonb_build_object(
                         'submitted_at',    v_submitted_at,
                         'submitted_score', p_score,
                         'submitted_tags',  to_jsonb(COALESCE(p_tags, ARRAY[]::TEXT[]))
                       )
  WHERE  id = p_message_id;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    -- Roll back the rating insert and return an error
    RAISE EXCEPTION 'trip_message % not found', p_message_id;
  END IF;

  RETURN jsonb_build_object('ok', TRUE, 'submitted_at', v_submitted_at);
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_trip_feedback(UUID, UUID, UUID, TEXT, UUID, INT, TEXT[]) TO authenticated;

COMMENT ON FUNCTION public.submit_trip_feedback IS
  'Atomic feedback submit: upserts a rating row and stamps submitted_at on the '
  'feedback_request message metadata in a single transaction. '
  'Replaces the 3-round-trip client-side flow (upsert + SELECT + UPDATE). '
  'Returns {ok: true, submitted_at: ...} on success or {error: ...} on guard failure.';
