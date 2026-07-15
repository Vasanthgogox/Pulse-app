-- Network Chat System
-- Org-to-org B2B conversations, independent of any trip.
-- org_a_id < org_b_id always (application layer enforces ordering so one row per pair).

-- ── Conversations ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS network_conversations (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_a_id              UUID        NOT NULL,
  org_b_id              UUID        NOT NULL,
  org_a_name            TEXT        NOT NULL,
  org_b_name            TEXT        NOT NULL,
  last_message_at       TIMESTAMPTZ,
  last_message_preview  TEXT,
  unread_count_a        INTEGER     NOT NULL DEFAULT 0,
  unread_count_b        INTEGER     NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (org_a_id, org_b_id),
  CHECK (org_a_id <> org_b_id)
);

-- ── Messages ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS network_messages (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id  UUID        NOT NULL REFERENCES network_conversations(id) ON DELETE CASCADE,
  sender_org_id    UUID        NOT NULL,
  sender_user_id   UUID        REFERENCES auth.users(id),
  sender_name      TEXT        NOT NULL,
  content          TEXT        NOT NULL CHECK (char_length(content) BETWEEN 1 AND 4000),
  is_read_by_other BOOLEAN     NOT NULL DEFAULT FALSE,
  read_at          TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_network_conversations_org_a
  ON network_conversations (org_a_id, last_message_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_network_conversations_org_b
  ON network_conversations (org_b_id, last_message_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_network_messages_conv_time
  ON network_messages (conversation_id, created_at ASC);

-- ── Row-Level Security ────────────────────────────────────────────────────────

ALTER TABLE network_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE network_messages      ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_members_access_network_conversations"
  ON network_conversations FOR ALL
  USING (
    org_a_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid())
    OR
    org_b_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid())
  );

CREATE POLICY "org_members_access_network_messages"
  ON network_messages FOR ALL
  USING (
    conversation_id IN (
      SELECT id FROM network_conversations
      WHERE org_a_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid())
         OR org_b_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid())
    )
  );

-- ── Trigger: sync conversation metadata on new message ────────────────────────

CREATE OR REPLACE FUNCTION sync_network_conversation_on_message()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_org_a UUID;
  v_org_b UUID;
BEGIN
  SELECT org_a_id, org_b_id INTO v_org_a, v_org_b
  FROM network_conversations WHERE id = NEW.conversation_id;

  UPDATE network_conversations
  SET
    last_message_at      = NEW.created_at,
    last_message_preview = LEFT(NEW.content, 120),
    unread_count_a = CASE WHEN NEW.sender_org_id <> v_org_a THEN unread_count_a + 1 ELSE unread_count_a END,
    unread_count_b = CASE WHEN NEW.sender_org_id <> v_org_b THEN unread_count_b + 1 ELSE unread_count_b END,
    updated_at = NOW()
  WHERE id = NEW.conversation_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_network_message_insert ON network_messages;
CREATE TRIGGER on_network_message_insert
  AFTER INSERT ON network_messages
  FOR EACH ROW EXECUTE FUNCTION sync_network_conversation_on_message();

-- ── RPC: mark network conversation as read for one org ───────────────────────

CREATE OR REPLACE FUNCTION mark_network_conversation_read(
  p_conversation_id UUID,
  p_reader_org_id   UUID
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_org_a UUID;
BEGIN
  SELECT org_a_id INTO v_org_a FROM network_conversations WHERE id = p_conversation_id;

  IF p_reader_org_id = v_org_a THEN
    UPDATE network_conversations SET unread_count_a = 0, updated_at = NOW() WHERE id = p_conversation_id;
  ELSE
    UPDATE network_conversations SET unread_count_b = 0, updated_at = NOW() WHERE id = p_conversation_id;
  END IF;

  UPDATE network_messages
  SET is_read_by_other = TRUE, read_at = NOW()
  WHERE conversation_id = p_conversation_id
    AND sender_org_id <> p_reader_org_id
    AND is_read_by_other = FALSE;
END;
$$;
