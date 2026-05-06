-- Idempotent fix: ensure trip_messages.message_type constraint includes
-- 'feedback_request', which was added in 20260520120000 but may be missing
-- from the live DB if it was restored from a pre-migration snapshot.

ALTER TABLE public.trip_messages DROP CONSTRAINT IF EXISTS trip_messages_message_type_check;
ALTER TABLE public.trip_messages ADD CONSTRAINT trip_messages_message_type_check
  CHECK (
    message_type = ANY (
      ARRAY[
        'text',
        'update',
        'question',
        'challenge',
        'system',
        'ledger_event',
        'document_share',
        'feedback_request'
      ]
    )
  );
