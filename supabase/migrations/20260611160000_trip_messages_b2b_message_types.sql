-- Align trip_messages.message_type CHECK with Bootstrap & Patch multiplex types
-- (ledger_update, assignment_update, document_upload) used by useChatStore.

ALTER TABLE public.trip_messages DROP CONSTRAINT IF EXISTS trip_messages_message_type_check;

ALTER TABLE public.trip_messages ADD CONSTRAINT trip_messages_message_type_check
  CHECK (
    message_type = ANY (
      ARRAY[
        'text',
        'chat',
        'update',
        'question',
        'challenge',
        'system',
        'system_log',
        'ledger_event',
        'ledger',
        'payment',
        'ledger_update',
        'assignment_update',
        'document_upload',
        'document_share',
        'feedback_request',
        'feedback',
        'image',
        'status_change',
        'tracking'
      ]
    )
  );
