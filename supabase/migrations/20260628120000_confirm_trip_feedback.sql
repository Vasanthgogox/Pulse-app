-- confirm_trip_feedback — thin server entry for WhatsApp-style one-tap feedback.
-- Resolves fleet org + rated party from the message row and delegates to
-- submit_trip_feedback (atomic ratings upsert + metadata stamp).
--
-- Also extends submit_trip_feedback metadata merge with `rating` (duplicate of
-- submitted_score) so bootstrap / clients that only read `metadata.rating` stay in sync.

CREATE OR REPLACE FUNCTION public.submit_trip_feedback(
  p_organization_id  UUID,
  p_trip_id          UUID,
  p_message_id       UUID,
  p_rated_type       TEXT,
  p_rated_id         UUID,
  p_score            INT,
  p_tags             TEXT[]
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
  p_score := GREATEST(1, LEAST(5, p_score));

  IF EXISTS (
    SELECT 1
    FROM   public.trip_messages
    WHERE  id = p_message_id
      AND  (metadata->>'submitted_at') IS NOT NULL
  ) THEN
    RETURN jsonb_build_object('error', 'already_submitted');
  END IF;

  v_comment := jsonb_build_object(
    'source', 'trip_chat_feedback',
    'tags',   to_jsonb(COALESCE(p_tags, ARRAY[]::TEXT[]))
  )::TEXT;

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

  v_submitted_at := to_char(
    now() AT TIME ZONE 'UTC',
    'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
  );

  UPDATE public.trip_messages
  SET    metadata = COALESCE(metadata, '{}'::JSONB)
                    || jsonb_build_object(
                         'submitted_at',    v_submitted_at,
                         'submitted_score', p_score,
                         'submitted_tags',  to_jsonb(COALESCE(p_tags, ARRAY[]::TEXT[])),
                         'rating',          to_jsonb(p_score)
                       )
  WHERE  id = p_message_id;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    RAISE EXCEPTION 'trip_message % not found', p_message_id;
  END IF;

  RETURN jsonb_build_object('ok', TRUE, 'submitted_at', v_submitted_at);
END;
$$;

CREATE OR REPLACE FUNCTION public.confirm_trip_feedback(
  p_msg_id UUID,
  p_rating INT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_meta JSONB;
  v_trip UUID;
  v_org  UUID;
  v_rt   TEXT;
  v_rid  TEXT;
BEGIN
  p_rating := GREATEST(1, LEAST(5, p_rating));

  SELECT tm.metadata, tm.trip_id, t.organization_id
  INTO v_meta, v_trip, v_org
  FROM   public.trip_messages tm
  JOIN   public.trips t ON t.id = tm.trip_id
  WHERE  tm.id = p_msg_id;

  IF v_meta IS NULL OR v_trip IS NULL OR v_org IS NULL THEN
    RETURN jsonb_build_object('error', 'message_not_found');
  END IF;

  v_rt := lower(trim(v_meta->>'rated_party_type'));
  IF v_rt NOT IN ('client', 'supplier', 'driver') THEN
    RETURN jsonb_build_object('error', 'invalid_metadata');
  END IF;

  v_rid := trim(v_meta->>'rated_id');
  IF v_rid = '' OR v_rid IS NULL THEN
    RETURN jsonb_build_object('error', 'invalid_metadata');
  END IF;

  RETURN public.submit_trip_feedback(
    v_org,
    v_trip,
    p_msg_id,
    v_rt,
    v_rid::uuid,
    p_rating,
    ARRAY[]::text[]
  );
EXCEPTION
  WHEN invalid_text_representation THEN
    RETURN jsonb_build_object('error', 'invalid_metadata');
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirm_trip_feedback(UUID, INT) TO authenticated;

COMMENT ON FUNCTION public.confirm_trip_feedback(UUID, INT) IS
  'One-tap trip chat feedback: loads trip owner org + rated party from trip_messages.metadata, '
  'then delegates to submit_trip_feedback. Does not mutate trips.status (lifecycle statuses only).';
