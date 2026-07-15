-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: Slack-style chat features
--   • Emoji reactions (JSONB)
--   • Reply threading (reply_to_id + reply_to_preview)
--   • Performance indexes for hub list + unread queries
--   • toggle_trip_message_reaction RPC (atomic JSONB update)
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Emoji reactions: { "👍": ["user-id-1", "user-id-2"], "❤️": ["user-id-3"] }
ALTER TABLE trip_messages
  ADD COLUMN IF NOT EXISTS reactions JSONB DEFAULT '{}'::jsonb;

-- 2. Reply threading — reference an earlier message in same conversation
ALTER TABLE trip_messages
  ADD COLUMN IF NOT EXISTS reply_to_id UUID
    REFERENCES trip_messages(id) ON DELETE SET NULL;

-- Inline preview snapshot so the reply card renders without a join
-- Schema: { sender_name: string, content: string, message_type: string }
ALTER TABLE trip_messages
  ADD COLUMN IF NOT EXISTS reply_to_preview JSONB;

-- ─────────────────────────────────────────────────────────────────────────────
-- Indexes
-- ─────────────────────────────────────────────────────────────────────────────

-- Conversation hub: paginate org conversations by recency
CREATE INDEX IF NOT EXISTS idx_trip_conversations_org_paged
  ON trip_conversations(organization_id, last_message_at DESC NULLS LAST, id);

-- Fast unread count queries per conversation
CREATE INDEX IF NOT EXISTS idx_trip_messages_unread_conv
  ON trip_messages(conversation_id, created_at DESC)
  WHERE is_read = FALSE;

-- Thread-level replies lookup
CREATE INDEX IF NOT EXISTS idx_trip_messages_reply_to
  ON trip_messages(reply_to_id)
  WHERE reply_to_id IS NOT NULL;

-- Partial GIN index for reaction lookups (only rows that have reactions)
CREATE INDEX IF NOT EXISTS idx_trip_messages_reactions_gin
  ON trip_messages USING GIN(reactions)
  WHERE reactions IS NOT NULL AND reactions != '{}'::jsonb;

-- ─────────────────────────────────────────────────────────────────────────────
-- RPC: toggle_trip_message_reaction
--   Atomically adds or removes a user's reaction on a message.
--   Returns the updated reactions JSONB.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION toggle_trip_message_reaction(
  p_message_id   UUID,
  p_user_id      UUID,
  p_emoji        TEXT,
  p_org_id       UUID  -- used for RLS pre-check
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reactions    JSONB;
  v_user_ids     JSONB;
  v_uid_text     TEXT := p_user_id::TEXT;
  v_org_check    UUID;
BEGIN
  -- Verify caller belongs to the org that owns this message
  SELECT organization_id INTO v_org_check
  FROM trip_messages
  WHERE id = p_message_id;

  IF v_org_check IS NULL THEN
    RAISE EXCEPTION 'message not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_org_check != p_org_id THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  -- Load current reactions
  SELECT COALESCE(reactions, '{}'::jsonb) INTO v_reactions
  FROM trip_messages WHERE id = p_message_id;

  v_user_ids := COALESCE(v_reactions->p_emoji, '[]'::jsonb);

  IF v_user_ids @> to_jsonb(v_uid_text) THEN
    -- Remove: filter out this user id
    SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
    INTO v_user_ids
    FROM jsonb_array_elements(v_user_ids) AS elem
    WHERE elem <> to_jsonb(v_uid_text);

    IF jsonb_array_length(v_user_ids) = 0 THEN
      v_reactions := v_reactions - p_emoji;          -- drop empty key
    ELSE
      v_reactions := jsonb_set(v_reactions, ARRAY[p_emoji], v_user_ids);
    END IF;
  ELSE
    -- Add: append user id to the array
    v_user_ids  := v_user_ids || to_jsonb(v_uid_text);
    v_reactions := jsonb_set(v_reactions, ARRAY[p_emoji], v_user_ids, true);
  END IF;

  UPDATE trip_messages
  SET reactions = v_reactions
  WHERE id = p_message_id;

  RETURN v_reactions;
END;
$$;

COMMENT ON FUNCTION toggle_trip_message_reaction IS
  'Idempotent emoji reaction toggle. Adds the emoji for the user if absent, removes it if present. Returns updated reactions map.';
