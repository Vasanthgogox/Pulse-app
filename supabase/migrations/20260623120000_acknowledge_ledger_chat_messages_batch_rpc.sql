-- Single-statement ack for chat "Add to book" (all matching ledger rows in one UPDATE).
-- Avoids N sequential client updates + multiple round-trips on trip_messages.

CREATE OR REPLACE FUNCTION public.acknowledge_ledger_messages_for_transaction(
  p_message_id uuid,
  p_conversation_id uuid,
  p_acknowledged_at text
)
RETURNS integer
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  WITH src AS (
    SELECT tm.conversation_id, tm.metadata ->> 'transaction_id' AS tx_id
    FROM public.trip_messages tm
    WHERE tm.id = p_message_id
      AND tm.conversation_id = p_conversation_id
  ),
  updated AS (
    UPDATE public.trip_messages tm
    SET metadata = COALESCE(tm.metadata, '{}'::jsonb)
      || jsonb_build_object('acknowledged_at', to_jsonb(p_acknowledged_at))
    FROM src
    WHERE src.tx_id IS NOT NULL
      AND tm.conversation_id = src.conversation_id
      AND tm.message_type = ANY (ARRAY['ledger_event'::text, 'ledger'::text, 'payment'::text])
      AND (tm.metadata ->> 'transaction_id') IS NOT DISTINCT FROM src.tx_id
    RETURNING tm.id
  )
  SELECT count(*)::integer FROM updated;
$$;

COMMENT ON FUNCTION public.acknowledge_ledger_messages_for_transaction(uuid, uuid, text) IS
  'Sets metadata.acknowledged_at on all ledger-like trip_messages in the conversation sharing the same transaction_id as the source message.';

GRANT EXECUTE ON FUNCTION public.acknowledge_ledger_messages_for_transaction(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.acknowledge_ledger_messages_for_transaction(uuid, uuid, text) TO service_role;
