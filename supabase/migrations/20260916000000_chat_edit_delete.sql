-- Add edit and soft-delete support to trip_messages

ALTER TABLE trip_messages
  ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT FALSE;

-- Index for filtering deleted messages in history queries
CREATE INDEX IF NOT EXISTS idx_trip_messages_is_deleted
  ON trip_messages (conversation_id, is_deleted)
  WHERE is_deleted = FALSE;
