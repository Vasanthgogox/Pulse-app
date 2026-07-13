-- ─────────────────────────────────────────────────────────────────────────────
-- submit_atomic_feedback
--
-- Replaces the three-round-trip feedback flow:
--   INSERT ratings → SELECT trip metadata → UPDATE message metadata
--
-- Now a single DB call that:
--   1. Guards idempotency  (returns existing data if already submitted)
--   2. Upserts the rating record
--   3. Stamps message.metadata with submitted_at / submitted_score / submitted_tags
--      using JSONB || merge (no prior SELECT needed)
--   4. Returns the full stamped metadata so the frontend can patch the local
--      store directly — no DB re-fetch or hydrateConversationById call required.
--
-- Frontend optimistic flow:
--   a. Patch chatStore immediately with { submitted_at: now, score, tags }
--   b. Call this RPC in the background
--   c. On success: RPC returns the canonical metadata — overwrite the patch
--   d. On failure: revert the chatStore patch to the pre-submit metadata
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.submit_atomic_feedback(
  p_organization_id UUID,
  p_trip_id         UUID,
  p_message_id      UUID,
  p_rated_type      TEXT,
  p_rated_id        UUID,
  p_score           INT,
  p_tags            TEXT[] DEFAULT ARRAY[]::TEXT[],
  p_comment         TEXT   DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_submitted_at TEXT;
  v_rows         INT;
  v_existing     JSONB;
BEGIN
  -- Clamp score to valid range
  p_score := GREATEST(1, LEAST(5, p_score));

  -- Idempotency: if already submitted, return the stored metadata unchanged.
  SELECT metadata INTO v_existing
  FROM   public.trip_messages
  WHERE  id = p_message_id;

  IF (v_existing->>'submitted_at') IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok',               TRUE,
      'already_submitted', TRUE,
      'message_id',       p_message_id,
      'submitted_at',     v_existing->>'submitted_at',
      'submitted_score',  (v_existing->>'submitted_score')::INT,
      'submitted_tags',   v_existing->'submitted_tags'
    );
  END IF;

  -- Upsert rating record
  INSERT INTO public.ratings (
    organization_id, trip_id,
    rated_type, rated_id,
    score, tags, comment,
    created_at
  )
  VALUES (
    p_organization_id, p_trip_id,
    p_rated_type, p_rated_id,
    p_score, p_tags, p_comment,
    NOW()
  )
  ON CONFLICT (organization_id, trip_id, rated_type, rated_id)
  DO UPDATE SET
    score      = EXCLUDED.score,
    tags       = EXCLUDED.tags,
    comment    = COALESCE(EXCLUDED.comment, ratings.comment),
    updated_at = NOW();

  -- Stamp message metadata atomically — JSONB || requires no prior SELECT
  v_submitted_at := to_char(
    now() AT TIME ZONE 'UTC',
    'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
  );

  UPDATE public.trip_messages
  SET    metadata = COALESCE(metadata, '{}'::JSONB) || jsonb_build_object(
    'submitted_at',    v_submitted_at,
    'submitted_score', p_score,
    'submitted_tags',  to_jsonb(COALESCE(p_tags, ARRAY[]::TEXT[]))
  )
  WHERE  id = p_message_id;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    RAISE EXCEPTION 'trip_message % not found', p_message_id;
  END IF;

  RETURN jsonb_build_object(
    'ok',               TRUE,
    'already_submitted', FALSE,
    'message_id',       p_message_id,
    'submitted_at',     v_submitted_at,
    'submitted_score',  p_score,
    'submitted_tags',   to_jsonb(COALESCE(p_tags, ARRAY[]::TEXT[]))
  );
END;
$$;

REVOKE ALL  ON FUNCTION public.submit_atomic_feedback(UUID,UUID,UUID,TEXT,UUID,INT,TEXT[],TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_atomic_feedback(UUID,UUID,UUID,TEXT,UUID,INT,TEXT[],TEXT) TO authenticated;
