-- Trip Chat System
-- One 1:1 conversation per (trip_id, party_type).
-- party_type ∈ {'client', 'supplier', 'driver'} — no group chats.

-- ── Conversations ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS trip_conversations (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id         UUID        NOT NULL,
  trip_id                 UUID        NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  party_type              TEXT        NOT NULL CHECK (party_type IN ('client', 'supplier', 'driver')),
  party_name              TEXT        NOT NULL,
  client_id               UUID        REFERENCES clients(id)   ON DELETE SET NULL,
  supplier_id             UUID        REFERENCES suppliers(id) ON DELETE SET NULL,
  driver_id               UUID        REFERENCES drivers(id)   ON DELETE SET NULL,
  last_message_at         TIMESTAMPTZ,
  last_message_preview    TEXT,
  unread_dispatcher_count INTEGER     NOT NULL DEFAULT 0,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (trip_id, party_type),

  -- Exactly one party FK must be present, matching party_type.
  CONSTRAINT party_ref_consistent CHECK (
    (party_type = 'client'   AND client_id   IS NOT NULL AND supplier_id IS NULL AND driver_id IS NULL) OR
    (party_type = 'supplier' AND supplier_id IS NOT NULL AND client_id   IS NULL AND driver_id IS NULL) OR
    (party_type = 'driver'   AND driver_id   IS NOT NULL AND client_id   IS NULL AND supplier_id IS NULL)
  )
);

-- ── Messages ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS trip_messages (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID        NOT NULL REFERENCES trip_conversations(id) ON DELETE CASCADE,
  organization_id UUID        NOT NULL,
  sender_user_id  UUID        REFERENCES auth.users(id),
  sender_role     TEXT        NOT NULL CHECK (sender_role IN ('dispatcher', 'client', 'supplier', 'driver', 'system')),
  sender_name     TEXT        NOT NULL,
  content         TEXT        NOT NULL CHECK (char_length(content) BETWEEN 1 AND 4000),
  message_type    TEXT        NOT NULL DEFAULT 'text'
                              CHECK (message_type IN ('text', 'update', 'question', 'challenge', 'system')),
  is_read         BOOLEAN     NOT NULL DEFAULT FALSE,
  read_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_trip_conversations_org
  ON trip_conversations (organization_id, last_message_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_trip_conversations_trip
  ON trip_conversations (trip_id);

CREATE INDEX IF NOT EXISTS idx_trip_messages_conv_time
  ON trip_messages (conversation_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_trip_messages_unread
  ON trip_messages (conversation_id, is_read) WHERE is_read = FALSE;

-- ── Row-Level Security ────────────────────────────────────────────────────────

ALTER TABLE trip_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE trip_messages      ENABLE ROW LEVEL SECURITY;

CREATE POLICY "organization_members_can_manage_trip_conversations"
  ON trip_conversations FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "organization_members_can_manage_trip_messages"
  ON trip_messages FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  );

-- ── Trigger: sync conversation metadata after each new message ────────────────

CREATE OR REPLACE FUNCTION sync_conversation_on_message()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE trip_conversations
  SET
    last_message_at      = NEW.created_at,
    last_message_preview = LEFT(NEW.content, 120),
    unread_dispatcher_count = CASE
      WHEN NEW.sender_role <> 'dispatcher' THEN unread_dispatcher_count + 1
      ELSE unread_dispatcher_count
    END,
    updated_at = NOW()
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_trip_message_insert ON trip_messages;
CREATE TRIGGER on_trip_message_insert
  AFTER INSERT ON trip_messages
  FOR EACH ROW EXECUTE FUNCTION sync_conversation_on_message();

-- ── RPC: mark all unread messages in a conversation as read ──────────────────

CREATE OR REPLACE FUNCTION mark_conversation_read(p_conversation_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE trip_conversations
  SET unread_dispatcher_count = 0, updated_at = NOW()
  WHERE id = p_conversation_id;

  UPDATE trip_messages
  SET is_read = TRUE, read_at = NOW()
  WHERE conversation_id = p_conversation_id
    AND sender_role <> 'dispatcher'
    AND is_read = FALSE;
END;
$$;
