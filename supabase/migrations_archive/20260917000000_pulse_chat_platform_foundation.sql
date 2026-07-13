-- ═════════════════════════════════════════════════════════════════════════════
-- Pulse Chat Platform — Phase 0 Foundation
--
-- Unified chat_* schema deployed ALONGSIDE legacy trip_/network_ chat:
--   • chat_conversations / chat_participants / chat_messages
--   • chat_attachments / chat_reactions / chat_read_receipts
--   • chat_mentions / chat_pins / chat_audit_log / chat_messages_archive
--   • Backfill from trip_conversations + network_conversations
--   • DB-side dual-write: legacy message INSERT/UPDATE mirrors into chat_messages
--     (same uuid → idempotent, zero client changes required)
--   • RPCs: send_chat_message (offline-idempotent), get_chat_inbox,
--     get_chat_messages, ensure_direct_chat, ensure_chat_channel,
--     toggle_chat_reaction, mark_chat_conversation_read, search_chat_messages,
--     archive_chat_messages
--
-- Read receipts model: per-participant last_read_at is the primary unread/tick
-- source (cheap, WhatsApp-style). chat_read_receipts is reserved for explicit
-- per-message receipts on action cards.
-- ═════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Tables
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.chat_conversations (
  id                              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id                 uuid        NOT NULL,
  conversation_type               text        NOT NULL CHECK (conversation_type IN
    ('direct','direct_org','trip','trip_lane','customer','supplier','channel','system')),
  title                           text,
  trip_id                         uuid        REFERENCES public.trips(id)     ON DELETE CASCADE,
  client_id                       uuid        REFERENCES public.clients(id)   ON DELETE SET NULL,
  supplier_id                     uuid        REFERENCES public.suppliers(id) ON DELETE SET NULL,
  driver_id                       uuid        REFERENCES public.drivers(id)   ON DELETE SET NULL,
  -- Deterministic key for channels and DMs (e.g. 'ops', 'dm:<uidA>:<uidB>').
  channel_key                     text,
  created_by                      uuid        REFERENCES auth.users(id),
  is_archived                     boolean     NOT NULL DEFAULT false,
  last_message_at                 timestamptz,
  last_message_preview            text,
  message_count                   integer     NOT NULL DEFAULT 0,
  metadata                        jsonb       NOT NULL DEFAULT '{}'::jsonb,
  legacy_trip_conversation_id     uuid        UNIQUE REFERENCES public.trip_conversations(id)    ON DELETE SET NULL,
  legacy_network_conversation_id  uuid        UNIQUE REFERENCES public.network_conversations(id) ON DELETE SET NULL,
  created_at                      timestamptz NOT NULL DEFAULT now(),
  updated_at                      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_chat_conversations_org_channel_key
  ON public.chat_conversations (organization_id, channel_key)
  WHERE channel_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_chat_conversations_org_recent
  ON public.chat_conversations (organization_id, last_message_at DESC NULLS LAST, id);

CREATE INDEX IF NOT EXISTS idx_chat_conversations_trip
  ON public.chat_conversations (trip_id)
  WHERE trip_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.chat_participants (
  conversation_id   uuid        NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  user_id           uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  participant_role  text        NOT NULL DEFAULT 'member',
  joined_at         timestamptz NOT NULL DEFAULT now(),
  last_read_at      timestamptz,
  muted_until       timestamptz,
  PRIMARY KEY (conversation_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_participants_user
  ON public.chat_participants (user_id, conversation_id);

CREATE TABLE IF NOT EXISTS public.chat_messages (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id    uuid        NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  organization_id    uuid        NOT NULL,
  sender_user_id     uuid,
  sender_type        text        NOT NULL DEFAULT 'user' CHECK (sender_type IN ('user','system','integration')),
  sender_name        text        NOT NULL DEFAULT '',
  -- Legacy compat lane (dispatcher/client/supplier/driver/system); free text by design.
  sender_role        text,
  -- Validated at RPC level; superset of legacy trip message types.
  message_type       text        NOT NULL DEFAULT 'text',
  content            text        NOT NULL DEFAULT '' CHECK (char_length(content) <= 8000),
  metadata           jsonb       NOT NULL DEFAULT '{}'::jsonb,
  reply_to_id        uuid        REFERENCES public.chat_messages(id) ON DELETE SET NULL,
  -- Offline-first idempotency key generated on the client before send.
  client_message_id  uuid,
  edited_at          timestamptz,
  deleted_at         timestamptz,
  -- 'trip' | 'network' when mirrored from legacy tables (id matches legacy row id).
  legacy_source      text,
  created_at         timestamptz NOT NULL DEFAULT now()
);

-- ON CONFLICT target for offline retry (partial unique).
CREATE UNIQUE INDEX IF NOT EXISTS ux_chat_messages_conv_client_msg
  ON public.chat_messages (conversation_id, client_message_id)
  WHERE client_message_id IS NOT NULL;

-- Thread timeline (cursor pagination).
CREATE INDEX IF NOT EXISTS idx_chat_messages_conv_created
  ON public.chat_messages (conversation_id, created_at DESC, id);

-- Org-wide feeds + retention sweeps.
CREATE INDEX IF NOT EXISTS idx_chat_messages_org_created
  ON public.chat_messages (organization_id, created_at DESC);

-- System channel feed.
CREATE INDEX IF NOT EXISTS idx_chat_messages_org_type_created
  ON public.chat_messages (organization_id, message_type, created_at DESC)
  WHERE sender_type = 'system';

CREATE INDEX IF NOT EXISTS idx_chat_messages_reply_to
  ON public.chat_messages (reply_to_id)
  WHERE reply_to_id IS NOT NULL;

-- Full-text message search.
CREATE INDEX IF NOT EXISTS idx_chat_messages_content_fts
  ON public.chat_messages USING GIN (to_tsvector('simple', coalesce(content, '')));

CREATE TABLE IF NOT EXISTS public.chat_attachments (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id     uuid        NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  storage_bucket text        NOT NULL DEFAULT 'trip-documents',
  storage_path   text        NOT NULL,
  mime_type      text,
  size_bytes     bigint,
  upload_status  text        NOT NULL DEFAULT 'complete' CHECK (upload_status IN ('pending','complete','failed')),
  metadata       jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_attachments_message
  ON public.chat_attachments (message_id);

CREATE TABLE IF NOT EXISTS public.chat_reactions (
  message_id  uuid        NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  emoji       text        NOT NULL CHECK (char_length(emoji) BETWEEN 1 AND 16),
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id, emoji)
);

CREATE TABLE IF NOT EXISTS public.chat_read_receipts (
  message_id    uuid        NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  user_id       uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  delivered_at  timestamptz,
  read_at       timestamptz,
  PRIMARY KEY (message_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.chat_mentions (
  message_id  uuid        NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_mentions_user_recent
  ON public.chat_mentions (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.chat_pins (
  conversation_id  uuid        NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  message_id       uuid        NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  pinned_by        uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  pinned_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, message_id)
);

CREATE TABLE IF NOT EXISTS public.chat_audit_log (
  id               bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id  uuid        NOT NULL,
  conversation_id  uuid,
  message_id       uuid,
  actor_user_id    uuid,
  action           text        NOT NULL,
  payload          jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_audit_log_org_recent
  ON public.chat_audit_log (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_chat_audit_log_message
  ON public.chat_audit_log (message_id)
  WHERE message_id IS NOT NULL;

-- Cold tier — populated by archive_chat_messages() (12-month hot policy).
CREATE TABLE IF NOT EXISTS public.chat_messages_archive (
  LIKE public.chat_messages INCLUDING DEFAULTS,
  archived_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_archive_conv_created
  ON public.chat_messages_archive (conversation_id, created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Access helpers (SECURITY DEFINER — avoid RLS recursion)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_chat_is_org_member(p_org_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization_members om
    WHERE om.organization_id = p_org_id AND om.user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.fn_chat_is_participant(p_conversation_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM chat_participants cp
    WHERE cp.conversation_id = p_conversation_id AND cp.user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.fn_chat_can_access_conversation(p_conversation_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM chat_conversations cc
    WHERE cc.id = p_conversation_id
      AND (
        public.fn_chat_is_participant(cc.id)
        OR EXISTS (
          SELECT 1 FROM organization_members om
          WHERE om.organization_id = cc.organization_id AND om.user_id = auth.uid()
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.fn_chat_is_org_member(uuid)            FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_chat_is_participant(uuid)           FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_chat_can_access_conversation(uuid)  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_chat_is_org_member(uuid)           TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_chat_is_participant(uuid)          TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_chat_can_access_conversation(uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Row-Level Security
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.chat_conversations    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_participants     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_attachments      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_reactions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_read_receipts    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_mentions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_pins             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_audit_log        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages_archive ENABLE ROW LEVEL SECURITY;

-- chat_conversations
DROP POLICY IF EXISTS "chat_conversations_select" ON public.chat_conversations;
CREATE POLICY "chat_conversations_select"
  ON public.chat_conversations FOR SELECT TO authenticated
  USING (
    public.fn_chat_is_org_member(organization_id)
    OR public.fn_chat_is_participant(id)
  );

DROP POLICY IF EXISTS "chat_conversations_insert" ON public.chat_conversations;
CREATE POLICY "chat_conversations_insert"
  ON public.chat_conversations FOR INSERT TO authenticated
  WITH CHECK (public.fn_chat_is_org_member(organization_id));

DROP POLICY IF EXISTS "chat_conversations_update" ON public.chat_conversations;
CREATE POLICY "chat_conversations_update"
  ON public.chat_conversations FOR UPDATE TO authenticated
  USING (public.fn_chat_is_org_member(organization_id))
  WITH CHECK (public.fn_chat_is_org_member(organization_id));

-- chat_participants
DROP POLICY IF EXISTS "chat_participants_select" ON public.chat_participants;
CREATE POLICY "chat_participants_select"
  ON public.chat_participants FOR SELECT TO authenticated
  USING (public.fn_chat_can_access_conversation(conversation_id));

DROP POLICY IF EXISTS "chat_participants_insert" ON public.chat_participants;
CREATE POLICY "chat_participants_insert"
  ON public.chat_participants FOR INSERT TO authenticated
  WITH CHECK (
    public.fn_chat_can_access_conversation(conversation_id)
  );

DROP POLICY IF EXISTS "chat_participants_update_own" ON public.chat_participants;
CREATE POLICY "chat_participants_update_own"
  ON public.chat_participants FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "chat_participants_delete" ON public.chat_participants;
CREATE POLICY "chat_participants_delete"
  ON public.chat_participants FOR DELETE TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR public.fn_chat_can_access_conversation(conversation_id)
  );

-- chat_messages
DROP POLICY IF EXISTS "chat_messages_select" ON public.chat_messages;
CREATE POLICY "chat_messages_select"
  ON public.chat_messages FOR SELECT TO authenticated
  USING (public.fn_chat_can_access_conversation(conversation_id));

DROP POLICY IF EXISTS "chat_messages_insert_own" ON public.chat_messages;
CREATE POLICY "chat_messages_insert_own"
  ON public.chat_messages FOR INSERT TO authenticated
  WITH CHECK (
    sender_user_id = (SELECT auth.uid())
    AND sender_type = 'user'
    AND public.fn_chat_can_access_conversation(conversation_id)
  );

DROP POLICY IF EXISTS "chat_messages_update_own" ON public.chat_messages;
CREATE POLICY "chat_messages_update_own"
  ON public.chat_messages FOR UPDATE TO authenticated
  USING (sender_user_id = (SELECT auth.uid()))
  WITH CHECK (sender_user_id = (SELECT auth.uid()));

-- chat_attachments
DROP POLICY IF EXISTS "chat_attachments_select" ON public.chat_attachments;
CREATE POLICY "chat_attachments_select"
  ON public.chat_attachments FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.chat_messages m
      WHERE m.id = chat_attachments.message_id
        AND public.fn_chat_can_access_conversation(m.conversation_id)
    )
  );

DROP POLICY IF EXISTS "chat_attachments_insert" ON public.chat_attachments;
CREATE POLICY "chat_attachments_insert"
  ON public.chat_attachments FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.chat_messages m
      WHERE m.id = chat_attachments.message_id
        AND m.sender_user_id = (SELECT auth.uid())
    )
  );

-- chat_reactions
DROP POLICY IF EXISTS "chat_reactions_select" ON public.chat_reactions;
CREATE POLICY "chat_reactions_select"
  ON public.chat_reactions FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.chat_messages m
      WHERE m.id = chat_reactions.message_id
        AND public.fn_chat_can_access_conversation(m.conversation_id)
    )
  );

DROP POLICY IF EXISTS "chat_reactions_write_own" ON public.chat_reactions;
CREATE POLICY "chat_reactions_write_own"
  ON public.chat_reactions FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "chat_reactions_delete_own" ON public.chat_reactions;
CREATE POLICY "chat_reactions_delete_own"
  ON public.chat_reactions FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- chat_read_receipts
DROP POLICY IF EXISTS "chat_read_receipts_select" ON public.chat_read_receipts;
CREATE POLICY "chat_read_receipts_select"
  ON public.chat_read_receipts FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.chat_messages m
      WHERE m.id = chat_read_receipts.message_id
        AND public.fn_chat_can_access_conversation(m.conversation_id)
    )
  );

DROP POLICY IF EXISTS "chat_read_receipts_upsert_own" ON public.chat_read_receipts;
CREATE POLICY "chat_read_receipts_upsert_own"
  ON public.chat_read_receipts FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "chat_read_receipts_update_own" ON public.chat_read_receipts;
CREATE POLICY "chat_read_receipts_update_own"
  ON public.chat_read_receipts FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- chat_mentions (written by send RPC; user reads own mentions + thread members read)
DROP POLICY IF EXISTS "chat_mentions_select" ON public.chat_mentions;
CREATE POLICY "chat_mentions_select"
  ON public.chat_mentions FOR SELECT TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.chat_messages m
      WHERE m.id = chat_mentions.message_id
        AND public.fn_chat_can_access_conversation(m.conversation_id)
    )
  );

-- chat_pins
DROP POLICY IF EXISTS "chat_pins_select" ON public.chat_pins;
CREATE POLICY "chat_pins_select"
  ON public.chat_pins FOR SELECT TO authenticated
  USING (public.fn_chat_can_access_conversation(conversation_id));

DROP POLICY IF EXISTS "chat_pins_insert" ON public.chat_pins;
CREATE POLICY "chat_pins_insert"
  ON public.chat_pins FOR INSERT TO authenticated
  WITH CHECK (
    pinned_by = (SELECT auth.uid())
    AND public.fn_chat_can_access_conversation(conversation_id)
  );

DROP POLICY IF EXISTS "chat_pins_delete" ON public.chat_pins;
CREATE POLICY "chat_pins_delete"
  ON public.chat_pins FOR DELETE TO authenticated
  USING (public.fn_chat_can_access_conversation(conversation_id));

-- chat_audit_log: org members read; writes only via DEFINER triggers/RPCs.
DROP POLICY IF EXISTS "chat_audit_log_select" ON public.chat_audit_log;
CREATE POLICY "chat_audit_log_select"
  ON public.chat_audit_log FOR SELECT TO authenticated
  USING (public.fn_chat_is_org_member(organization_id));

-- chat_messages_archive: org members read.
DROP POLICY IF EXISTS "chat_messages_archive_select" ON public.chat_messages_archive;
CREATE POLICY "chat_messages_archive_select"
  ON public.chat_messages_archive FOR SELECT TO authenticated
  USING (public.fn_chat_is_org_member(organization_id));

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Triggers — conversation sync + audit on chat_messages
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_chat_sync_conversation_on_message()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE chat_conversations
  SET
    last_message_at      = GREATEST(coalesce(last_message_at, NEW.created_at), NEW.created_at),
    last_message_preview = LEFT(coalesce(NEW.content, ''), 140),
    message_count        = message_count + 1,
    updated_at           = now()
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_chat_message_sync_conversation ON public.chat_messages;
CREATE TRIGGER trg_chat_message_sync_conversation
  AFTER INSERT ON public.chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.fn_chat_sync_conversation_on_message();

CREATE OR REPLACE FUNCTION public.fn_chat_audit_message()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO chat_audit_log (organization_id, conversation_id, message_id, actor_user_id, action, payload)
    VALUES (
      NEW.organization_id, NEW.conversation_id, NEW.id, NEW.sender_user_id,
      'message_sent',
      jsonb_build_object('message_type', NEW.message_type, 'legacy_source', NEW.legacy_source)
    );
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
      INSERT INTO chat_audit_log (organization_id, conversation_id, message_id, actor_user_id, action, payload)
      VALUES (NEW.organization_id, NEW.conversation_id, NEW.id, auth.uid(), 'message_deleted', '{}'::jsonb);
    ELSIF NEW.edited_at IS DISTINCT FROM OLD.edited_at THEN
      INSERT INTO chat_audit_log (organization_id, conversation_id, message_id, actor_user_id, action, payload)
      VALUES (
        NEW.organization_id, NEW.conversation_id, NEW.id, auth.uid(), 'message_edited',
        jsonb_build_object('previous_content_hash', md5(coalesce(OLD.content, '')))
      );
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_chat_message_audit ON public.chat_messages;
CREATE TRIGGER trg_chat_message_audit
  AFTER INSERT OR UPDATE ON public.chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.fn_chat_audit_message();

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Legacy bridge — conversation backfill helpers + dual-write mirror triggers
-- ─────────────────────────────────────────────────────────────────────────────

-- Ensure (or create) the unified conversation for a legacy trip lane.
CREATE OR REPLACE FUNCTION public.fn_chat_ensure_conv_for_trip_lane(p_trip_conversation_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conv_id uuid;
BEGIN
  SELECT id INTO v_conv_id
  FROM chat_conversations
  WHERE legacy_trip_conversation_id = p_trip_conversation_id;
  IF v_conv_id IS NOT NULL THEN RETURN v_conv_id; END IF;

  INSERT INTO chat_conversations (
    organization_id, conversation_type, title,
    trip_id, client_id, supplier_id, driver_id,
    last_message_at, last_message_preview,
    legacy_trip_conversation_id, metadata, created_at
  )
  SELECT
    tc.organization_id, 'trip_lane', tc.party_name,
    tc.trip_id, tc.client_id, tc.supplier_id, tc.driver_id,
    tc.last_message_at, tc.last_message_preview,
    tc.id,
    jsonb_build_object('party_type', tc.party_type),
    tc.created_at
  FROM trip_conversations tc
  WHERE tc.id = p_trip_conversation_id
  ON CONFLICT (legacy_trip_conversation_id) DO NOTHING
  RETURNING id INTO v_conv_id;

  IF v_conv_id IS NULL THEN
    SELECT id INTO v_conv_id
    FROM chat_conversations
    WHERE legacy_trip_conversation_id = p_trip_conversation_id;
  END IF;

  RETURN v_conv_id;
END;
$$;

-- Ensure (or create) the unified conversation for a legacy network (org↔org) thread.
CREATE OR REPLACE FUNCTION public.fn_chat_ensure_conv_for_network(p_network_conversation_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conv_id uuid;
BEGIN
  SELECT id INTO v_conv_id
  FROM chat_conversations
  WHERE legacy_network_conversation_id = p_network_conversation_id;
  IF v_conv_id IS NOT NULL THEN RETURN v_conv_id; END IF;

  INSERT INTO chat_conversations (
    organization_id, conversation_type, title,
    last_message_at, last_message_preview,
    legacy_network_conversation_id, metadata, created_at
  )
  SELECT
    nc.org_a_id, 'direct_org', nc.org_b_name,
    nc.last_message_at, nc.last_message_preview,
    nc.id,
    jsonb_build_object(
      'org_a_id', nc.org_a_id, 'org_a_name', nc.org_a_name,
      'org_b_id', nc.org_b_id, 'org_b_name', nc.org_b_name
    ),
    nc.created_at
  FROM network_conversations nc
  WHERE nc.id = p_network_conversation_id
  ON CONFLICT (legacy_network_conversation_id) DO NOTHING
  RETURNING id INTO v_conv_id;

  IF v_conv_id IS NULL THEN
    SELECT id INTO v_conv_id
    FROM chat_conversations
    WHERE legacy_network_conversation_id = p_network_conversation_id;
  END IF;

  RETURN v_conv_id;
END;
$$;

-- Mirror legacy trip_messages INSERT → chat_messages (same uuid; idempotent).
CREATE OR REPLACE FUNCTION public.fn_chat_mirror_trip_message_insert()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conv_id uuid;
BEGIN
  v_conv_id := public.fn_chat_ensure_conv_for_trip_lane(NEW.conversation_id);
  IF v_conv_id IS NULL THEN RETURN NEW; END IF;

  INSERT INTO chat_messages (
    id, conversation_id, organization_id,
    sender_user_id, sender_type, sender_name, sender_role,
    message_type, content, metadata, reply_to_id,
    legacy_source, created_at
  )
  VALUES (
    NEW.id, v_conv_id, NEW.organization_id,
    NEW.sender_user_id,
    CASE WHEN NEW.sender_role = 'system' THEN 'system' ELSE 'user' END,
    NEW.sender_name, NEW.sender_role,
    NEW.message_type, LEFT(coalesce(NEW.content, ''), 8000),
    coalesce(NEW.metadata, '{}'::jsonb),
    (SELECT cm.id FROM chat_messages cm WHERE cm.id = NEW.reply_to_id),
    'trip', NEW.created_at
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_chat_mirror_trip_message_insert ON public.trip_messages;
CREATE TRIGGER trg_chat_mirror_trip_message_insert
  AFTER INSERT ON public.trip_messages
  FOR EACH ROW EXECUTE FUNCTION public.fn_chat_mirror_trip_message_insert();

-- Mirror legacy trip_messages UPDATE (edits / soft delete / metadata patches).
CREATE OR REPLACE FUNCTION public.fn_chat_mirror_trip_message_update()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE chat_messages cm
  SET
    content    = LEFT(coalesce(NEW.content, ''), 8000),
    metadata   = coalesce(NEW.metadata, '{}'::jsonb),
    edited_at  = NEW.edited_at,
    deleted_at = CASE
                   WHEN coalesce(NEW.is_deleted, false) THEN coalesce(cm.deleted_at, now())
                   ELSE NULL
                 END
  WHERE cm.id = NEW.id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_chat_mirror_trip_message_update ON public.trip_messages;
CREATE TRIGGER trg_chat_mirror_trip_message_update
  AFTER UPDATE OF content, metadata, edited_at, is_deleted ON public.trip_messages
  FOR EACH ROW EXECUTE FUNCTION public.fn_chat_mirror_trip_message_update();

-- Mirror legacy network_messages INSERT → chat_messages.
CREATE OR REPLACE FUNCTION public.fn_chat_mirror_network_message_insert()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conv_id uuid;
  v_org_id  uuid;
BEGIN
  v_conv_id := public.fn_chat_ensure_conv_for_network(NEW.conversation_id);
  IF v_conv_id IS NULL THEN RETURN NEW; END IF;

  SELECT organization_id INTO v_org_id FROM chat_conversations WHERE id = v_conv_id;

  INSERT INTO chat_messages (
    id, conversation_id, organization_id,
    sender_user_id, sender_type, sender_name, sender_role,
    message_type, content, metadata,
    legacy_source, created_at
  )
  VALUES (
    NEW.id, v_conv_id, coalesce(v_org_id, NEW.sender_org_id),
    NEW.sender_user_id, 'user', NEW.sender_name, NULL,
    'text', LEFT(coalesce(NEW.content, ''), 8000),
    jsonb_build_object('sender_org_id', NEW.sender_org_id),
    'network', NEW.created_at
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_chat_mirror_network_message_insert ON public.network_messages;
CREATE TRIGGER trg_chat_mirror_network_message_insert
  AFTER INSERT ON public.network_messages
  FOR EACH ROW EXECUTE FUNCTION public.fn_chat_mirror_network_message_insert();

-- New legacy conversations get a unified row immediately (not only on first message).
CREATE OR REPLACE FUNCTION public.fn_chat_on_trip_conversation_insert()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.fn_chat_ensure_conv_for_trip_lane(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_chat_on_trip_conversation_insert ON public.trip_conversations;
CREATE TRIGGER trg_chat_on_trip_conversation_insert
  AFTER INSERT ON public.trip_conversations
  FOR EACH ROW EXECUTE FUNCTION public.fn_chat_on_trip_conversation_insert();

CREATE OR REPLACE FUNCTION public.fn_chat_on_network_conversation_insert()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.fn_chat_ensure_conv_for_network(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_chat_on_network_conversation_insert ON public.network_conversations;
CREATE TRIGGER trg_chat_on_network_conversation_insert
  AFTER INSERT ON public.network_conversations
  FOR EACH ROW EXECUTE FUNCTION public.fn_chat_on_network_conversation_insert();

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Backfill existing conversations (summaries only; message history stays in
--    legacy tables until the Phase 4 history migration)
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.chat_conversations (
  organization_id, conversation_type, title,
  trip_id, client_id, supplier_id, driver_id,
  last_message_at, last_message_preview,
  legacy_trip_conversation_id, metadata, created_at
)
SELECT
  tc.organization_id, 'trip_lane', tc.party_name,
  tc.trip_id, tc.client_id, tc.supplier_id, tc.driver_id,
  tc.last_message_at, tc.last_message_preview,
  tc.id,
  jsonb_build_object('party_type', tc.party_type),
  tc.created_at
FROM public.trip_conversations tc
ON CONFLICT (legacy_trip_conversation_id) DO NOTHING;

INSERT INTO public.chat_conversations (
  organization_id, conversation_type, title,
  last_message_at, last_message_preview,
  legacy_network_conversation_id, metadata, created_at
)
SELECT
  nc.org_a_id, 'direct_org', nc.org_b_name,
  nc.last_message_at, nc.last_message_preview,
  nc.id,
  jsonb_build_object(
    'org_a_id', nc.org_a_id, 'org_a_name', nc.org_a_name,
    'org_b_id', nc.org_b_id, 'org_b_name', nc.org_b_name
  ),
  nc.created_at
FROM public.network_conversations nc
ON CONFLICT (legacy_network_conversation_id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. RPCs
-- ─────────────────────────────────────────────────────────────────────────────

-- 7.1 send_chat_message — offline-idempotent send (client_message_id dedupe).
CREATE OR REPLACE FUNCTION public.send_chat_message(
  p_conversation_id   uuid,
  p_content           text,
  p_message_type      text    DEFAULT 'text',
  p_metadata          jsonb   DEFAULT NULL,
  p_client_message_id uuid    DEFAULT NULL,
  p_reply_to_id       uuid    DEFAULT NULL,
  p_mentions          uuid[]  DEFAULT NULL
)
RETURNS public.chat_messages
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conv    public.chat_conversations%ROWTYPE;
  v_row     public.chat_messages%ROWTYPE;
  v_name    text;
  v_mention uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  IF p_message_type NOT IN (
    'text','image','document','voice','location','action_card','reference','system'
  ) THEN
    RAISE EXCEPTION 'Invalid message_type: %', p_message_type;
  END IF;

  IF coalesce(char_length(p_content), 0) > 8000 THEN
    RAISE EXCEPTION 'Message too long';
  END IF;

  SELECT * INTO v_conv FROM chat_conversations WHERE id = p_conversation_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conversation not found: %', p_conversation_id;
  END IF;

  IF NOT public.fn_chat_can_access_conversation(p_conversation_id) THEN
    RAISE EXCEPTION 'Not authorized for conversation' USING ERRCODE = '42501';
  END IF;

  -- Offline retry replay: return the already-persisted row.
  IF p_client_message_id IS NOT NULL THEN
    SELECT * INTO v_row
    FROM chat_messages
    WHERE conversation_id = p_conversation_id
      AND client_message_id = p_client_message_id;
    IF FOUND THEN RETURN v_row; END IF;
  END IF;

  SELECT coalesce(
    nullif(trim(p.full_name), ''),
    nullif(trim(p.email), ''),
    'Member'
  ) INTO v_name
  FROM profiles p WHERE p.id = auth.uid();

  INSERT INTO chat_messages (
    conversation_id, organization_id,
    sender_user_id, sender_type, sender_name,
    message_type, content, metadata,
    reply_to_id, client_message_id
  )
  VALUES (
    p_conversation_id, v_conv.organization_id,
    auth.uid(), 'user', coalesce(v_name, 'Member'),
    p_message_type, coalesce(p_content, ''), coalesce(p_metadata, '{}'::jsonb),
    p_reply_to_id, p_client_message_id
  )
  ON CONFLICT (conversation_id, client_message_id) WHERE client_message_id IS NOT NULL
  DO NOTHING
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    SELECT * INTO v_row
    FROM chat_messages
    WHERE conversation_id = p_conversation_id
      AND client_message_id = p_client_message_id;
    RETURN v_row;
  END IF;

  -- Mentions
  IF p_mentions IS NOT NULL THEN
    FOREACH v_mention IN ARRAY p_mentions LOOP
      INSERT INTO chat_mentions (message_id, user_id)
      VALUES (v_row.id, v_mention)
      ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;

  -- Sender implicitly joins as participant (covers org-member senders).
  INSERT INTO chat_participants (conversation_id, user_id, participant_role, last_read_at)
  VALUES (p_conversation_id, auth.uid(), 'member', now())
  ON CONFLICT (conversation_id, user_id)
  DO UPDATE SET last_read_at = now();

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.send_chat_message(uuid, text, text, jsonb, uuid, uuid, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.send_chat_message(uuid, text, text, jsonb, uuid, uuid, uuid[]) TO authenticated;

-- 7.2 get_chat_inbox — cursor-paged conversation summaries with unread counts.
CREATE OR REPLACE FUNCTION public.get_chat_inbox(
  p_organization_id uuid,
  p_limit           int         DEFAULT 30,
  p_before          timestamptz DEFAULT NULL
)
RETURNS TABLE (
  id                   uuid,
  organization_id      uuid,
  conversation_type    text,
  title                text,
  trip_id              uuid,
  client_id            uuid,
  supplier_id          uuid,
  driver_id            uuid,
  channel_key          text,
  is_archived          boolean,
  last_message_at      timestamptz,
  last_message_preview text,
  message_count        integer,
  metadata             jsonb,
  created_at           timestamptz,
  my_last_read_at      timestamptz,
  unread_count         bigint
)
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    cc.id, cc.organization_id, cc.conversation_type, cc.title,
    cc.trip_id, cc.client_id, cc.supplier_id, cc.driver_id,
    cc.channel_key, cc.is_archived,
    cc.last_message_at, cc.last_message_preview, cc.message_count,
    cc.metadata, cc.created_at,
    cp.last_read_at AS my_last_read_at,
    coalesce(unread.n, 0) AS unread_count
  FROM chat_conversations cc
  LEFT JOIN chat_participants cp
    ON cp.conversation_id = cc.id AND cp.user_id = auth.uid()
  LEFT JOIN LATERAL (
    SELECT count(*) AS n
    FROM chat_messages m
    WHERE m.conversation_id = cc.id
      AND m.deleted_at IS NULL
      AND m.sender_user_id IS DISTINCT FROM auth.uid()
      AND m.created_at > coalesce(cp.last_read_at, 'epoch'::timestamptz)
  ) unread ON true
  WHERE cc.organization_id = p_organization_id
    AND cc.is_archived = false
    AND (p_before IS NULL OR cc.last_message_at < p_before)
  ORDER BY cc.last_message_at DESC NULLS LAST, cc.id
  LIMIT least(greatest(coalesce(p_limit, 30), 1), 100);
$$;

REVOKE ALL ON FUNCTION public.get_chat_inbox(uuid, int, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_chat_inbox(uuid, int, timestamptz) TO authenticated;

-- 7.3 get_chat_messages — keyset pagination (newest page when p_before is null).
CREATE OR REPLACE FUNCTION public.get_chat_messages(
  p_conversation_id uuid,
  p_before          timestamptz DEFAULT NULL,
  p_limit           int         DEFAULT 30
)
RETURNS SETOF public.chat_messages
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = public
AS $$
  SELECT m.*
  FROM chat_messages m
  WHERE m.conversation_id = p_conversation_id
    AND (p_before IS NULL OR m.created_at < p_before)
  ORDER BY m.created_at DESC, m.id DESC
  LIMIT least(greatest(coalesce(p_limit, 30), 1), 100);
$$;

REVOKE ALL ON FUNCTION public.get_chat_messages(uuid, timestamptz, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_chat_messages(uuid, timestamptz, int) TO authenticated;

-- 7.4 ensure_direct_chat — intra-org user↔user DM (deterministic channel_key).
CREATE OR REPLACE FUNCTION public.ensure_direct_chat(
  p_organization_id uuid,
  p_peer_user_id    uuid
)
RETURNS public.chat_conversations
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_self uuid := auth.uid();
  v_key  text;
  v_row  public.chat_conversations%ROWTYPE;
BEGIN
  IF v_self IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  IF p_peer_user_id = v_self THEN
    RAISE EXCEPTION 'Cannot open a DM with yourself';
  END IF;
  IF NOT public.fn_chat_is_org_member(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized for organization' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM organization_members om
    WHERE om.organization_id = p_organization_id AND om.user_id = p_peer_user_id
  ) THEN
    RAISE EXCEPTION 'Peer is not a member of this organization';
  END IF;

  v_key := 'dm:' || least(v_self, p_peer_user_id)::text
        || ':' || greatest(v_self, p_peer_user_id)::text;

  SELECT * INTO v_row
  FROM chat_conversations
  WHERE organization_id = p_organization_id AND channel_key = v_key;
  IF FOUND THEN RETURN v_row; END IF;

  INSERT INTO chat_conversations (organization_id, conversation_type, channel_key, created_by)
  VALUES (p_organization_id, 'direct', v_key, v_self)
  ON CONFLICT (organization_id, channel_key) WHERE channel_key IS NOT NULL
  DO NOTHING
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    SELECT * INTO v_row
    FROM chat_conversations
    WHERE organization_id = p_organization_id AND channel_key = v_key;
  END IF;

  INSERT INTO chat_participants (conversation_id, user_id)
  VALUES (v_row.id, v_self), (v_row.id, p_peer_user_id)
  ON CONFLICT DO NOTHING;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_direct_chat(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_direct_chat(uuid, uuid) TO authenticated;

-- 7.5 ensure_chat_channel — named group channel (ops / finance / branch).
CREATE OR REPLACE FUNCTION public.ensure_chat_channel(
  p_organization_id uuid,
  p_channel_key     text,
  p_title           text DEFAULT NULL
)
RETURNS public.chat_conversations
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key text := lower(trim(p_channel_key));
  v_row public.chat_conversations%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  IF v_key IS NULL OR v_key = '' OR v_key LIKE 'dm:%' THEN
    RAISE EXCEPTION 'Invalid channel key';
  END IF;
  IF NOT public.fn_chat_is_org_member(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized for organization' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_row
  FROM chat_conversations
  WHERE organization_id = p_organization_id AND channel_key = v_key;
  IF FOUND THEN RETURN v_row; END IF;

  INSERT INTO chat_conversations (organization_id, conversation_type, channel_key, title, created_by)
  VALUES (p_organization_id, 'channel', v_key, coalesce(p_title, initcap(replace(v_key, '_', ' '))), auth.uid())
  ON CONFLICT (organization_id, channel_key) WHERE channel_key IS NOT NULL
  DO NOTHING
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    SELECT * INTO v_row
    FROM chat_conversations
    WHERE organization_id = p_organization_id AND channel_key = v_key;
  END IF;

  INSERT INTO chat_participants (conversation_id, user_id, participant_role)
  VALUES (v_row.id, auth.uid(), 'admin')
  ON CONFLICT DO NOTHING;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_chat_channel(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_chat_channel(uuid, text, text) TO authenticated;

-- 7.6 toggle_chat_reaction — normalized add/remove; returns aggregated map.
CREATE OR REPLACE FUNCTION public.toggle_chat_reaction(
  p_message_id uuid,
  p_emoji      text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conv uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT conversation_id INTO v_conv FROM chat_messages WHERE id = p_message_id;
  IF v_conv IS NULL THEN
    RAISE EXCEPTION 'Message not found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.fn_chat_can_access_conversation(v_conv) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1 FROM chat_reactions
    WHERE message_id = p_message_id AND user_id = auth.uid() AND emoji = p_emoji
  ) THEN
    DELETE FROM chat_reactions
    WHERE message_id = p_message_id AND user_id = auth.uid() AND emoji = p_emoji;
  ELSE
    INSERT INTO chat_reactions (message_id, user_id, emoji)
    VALUES (p_message_id, auth.uid(), p_emoji)
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN (
    SELECT coalesce(
      jsonb_object_agg(r.emoji, r.user_ids),
      '{}'::jsonb
    )
    FROM (
      SELECT emoji, jsonb_agg(user_id::text ORDER BY created_at) AS user_ids
      FROM chat_reactions
      WHERE message_id = p_message_id
      GROUP BY emoji
    ) r
  );
END;
$$;

REVOKE ALL ON FUNCTION public.toggle_chat_reaction(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.toggle_chat_reaction(uuid, text) TO authenticated;

-- 7.7 mark_chat_conversation_read — advances participant cursor.
CREATE OR REPLACE FUNCTION public.mark_chat_conversation_read(
  p_conversation_id uuid,
  p_up_to           timestamptz DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  IF NOT public.fn_chat_can_access_conversation(p_conversation_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  INSERT INTO chat_participants (conversation_id, user_id, last_read_at)
  VALUES (p_conversation_id, auth.uid(), coalesce(p_up_to, now()))
  ON CONFLICT (conversation_id, user_id)
  DO UPDATE SET last_read_at = GREATEST(
    coalesce(chat_participants.last_read_at, 'epoch'::timestamptz),
    coalesce(EXCLUDED.last_read_at, now())
  );
END;
$$;

REVOKE ALL ON FUNCTION public.mark_chat_conversation_read(uuid, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_chat_conversation_read(uuid, timestamptz) TO authenticated;

-- 7.8 search_chat_messages — org-scoped full-text search (RLS filters access).
CREATE OR REPLACE FUNCTION public.search_chat_messages(
  p_organization_id uuid,
  p_query           text,
  p_limit           int DEFAULT 25
)
RETURNS SETOF public.chat_messages
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = public
AS $$
  SELECT m.*
  FROM chat_messages m
  WHERE m.organization_id = p_organization_id
    AND m.deleted_at IS NULL
    AND to_tsvector('simple', coalesce(m.content, ''))
        @@ websearch_to_tsquery('simple', p_query)
  ORDER BY m.created_at DESC
  LIMIT least(greatest(coalesce(p_limit, 25), 1), 100);
$$;

REVOKE ALL ON FUNCTION public.search_chat_messages(uuid, text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_chat_messages(uuid, text, int) TO authenticated;

-- 7.9 archive_chat_messages — 12-month hot retention (wire to pg_cron later).
CREATE OR REPLACE FUNCTION public.archive_chat_messages(
  p_older_than interval DEFAULT interval '12 months',
  p_batch      int      DEFAULT 5000
)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_moved integer;
BEGIN
  WITH moved AS (
    DELETE FROM chat_messages m
    WHERE m.id IN (
      SELECT id FROM chat_messages
      WHERE created_at < now() - p_older_than
      ORDER BY created_at
      LIMIT greatest(coalesce(p_batch, 5000), 1)
    )
    RETURNING m.*
  )
  INSERT INTO chat_messages_archive (
    id, conversation_id, organization_id, sender_user_id, sender_type,
    sender_name, sender_role, message_type, content, metadata, reply_to_id,
    client_message_id, edited_at, deleted_at, legacy_source, created_at
  )
  SELECT
    id, conversation_id, organization_id, sender_user_id, sender_type,
    sender_name, sender_role, message_type, content, metadata, reply_to_id,
    client_message_id, edited_at, deleted_at, legacy_source, created_at
  FROM moved;

  GET DIAGNOSTICS v_moved = ROW_COUNT;
  RETURN v_moved;
END;
$$;

REVOKE ALL ON FUNCTION public.archive_chat_messages(interval, int) FROM PUBLIC;
-- service_role only (cron / admin); not callable by app users.
GRANT EXECUTE ON FUNCTION public.archive_chat_messages(interval, int) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Realtime publication (conversation rows + messages)
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_conversations;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. Comments
-- ─────────────────────────────────────────────────────────────────────────────

COMMENT ON TABLE public.chat_conversations IS
  'Pulse Chat Platform unified conversation registry. Types: direct (user↔user), direct_org (legacy network), trip (unified room, Phase 2), trip_lane (legacy 1:1 lane bridge), customer, supplier, channel (group), system (auto feed).';
COMMENT ON TABLE public.chat_messages IS
  'Hot message store (12-month retention; see archive_chat_messages). Legacy trip_messages/network_messages mirror in via DB triggers with identical uuids.';
COMMENT ON COLUMN public.chat_messages.client_message_id IS
  'Client-generated idempotency key for offline-first retry. UNIQUE per conversation.';
COMMENT ON FUNCTION public.send_chat_message(uuid, text, text, jsonb, uuid, uuid, uuid[]) IS
  'Idempotent message send. Replaying the same client_message_id returns the original row instead of duplicating.';
COMMENT ON FUNCTION public.archive_chat_messages(interval, int) IS
  'Moves messages older than p_older_than into chat_messages_archive in batches. Run via pg_cron/scheduled job.';
