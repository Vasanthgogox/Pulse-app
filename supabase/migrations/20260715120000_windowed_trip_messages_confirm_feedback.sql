-- Windowed trip message history (WhatsApp-style) + lightweight confirm_trip_feedback.
--
-- 1) windowed_trip_message_history — newest N rows for ONE conversation lane.
--    INNER JOIN trip_conversations ties every row to that lane (participant silo:
--    each trip_conversations row is exactly one party_type + entity FKs).
-- 2) confirm_trip_feedback — single-row metadata update (no ratings INSERT).

CREATE OR REPLACE FUNCTION public.windowed_trip_message_history(
  p_conversation_id uuid,
  p_before          timestamptz DEFAULT NULL,
  p_limit           integer     DEFAULT 20,
  p_party_type      text        DEFAULT NULL
)
RETURNS SETOF public.trip_messages
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT m.*
  FROM   public.trip_messages m
  INNER JOIN public.trip_conversations tc ON tc.id = m.conversation_id
  WHERE  m.conversation_id = p_conversation_id
    AND  tc.id = p_conversation_id
    AND  (p_party_type IS NULL OR tc.party_type = p_party_type)
    AND  (p_before IS NULL OR m.created_at < p_before)
  ORDER BY m.created_at DESC
  LIMIT LEAST(GREATEST(COALESCE(NULLIF(p_limit, 0), 20), 1), 100);
$$;

GRANT EXECUTE ON FUNCTION public.windowed_trip_message_history(uuid, timestamptz, integer, text)
  TO authenticated;

COMMENT ON FUNCTION public.windowed_trip_message_history(uuid, timestamptz, integer, text) IS
  'Newest trip_messages for one trip_conversations lane; optional p_party_type must match tc.party_type.';

-- Replace heavy confirm_trip_feedback (ratings INSERT) with one UPDATE on trip_messages.
CREATE OR REPLACE FUNCTION public.confirm_trip_feedback(
  p_msg_id  uuid,
  p_rating  integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_submitted text;
  v_n         int;
BEGIN
  p_rating := GREATEST(1, LEAST(5, p_rating));

  v_submitted := to_char(
    (now() AT TIME ZONE 'utc'),
    'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
  );

  UPDATE public.trip_messages
  SET    metadata = COALESCE(metadata, '{}'::jsonb)
                    || jsonb_build_object(
                         'rating',        to_jsonb(p_rating),
                         'submitted_at',  to_jsonb(v_submitted),
                         'submitted_score', to_jsonb(p_rating)
                       )
  WHERE  id = p_msg_id
    AND  (metadata->>'submitted_at') IS NULL;

  GET DIAGNOSTICS v_n = ROW_COUNT;

  IF v_n = 1 THEN
    RETURN jsonb_build_object('ok', true, 'submitted_at', v_submitted);
  END IF;

  IF EXISTS (SELECT 1 FROM public.trip_messages WHERE id = p_msg_id) THEN
    RETURN jsonb_build_object('error', 'already_submitted');
  END IF;

  RETURN jsonb_build_object('error', 'message_not_found');
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirm_trip_feedback(uuid, integer) TO authenticated;

COMMENT ON FUNCTION public.confirm_trip_feedback(uuid, integer) IS
  'One-tap chat feedback: sets metadata.rating (+ submitted_at) on the feedback_request row; no ratings table write.';
