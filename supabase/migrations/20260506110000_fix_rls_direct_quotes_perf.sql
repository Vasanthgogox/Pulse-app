-- ROOT CAUSE FIX: DB outage on chat test
--
-- The two latest chat migrations added RLS policies on trip_messages and
-- trip_conversations that contain:
--   lower(trim(coalesce(dq.status, ''))) = 'accepted'
--
-- This is non-sargable: Postgres cannot use any index on direct_quotes.status
-- because the column is wrapped in lower/trim/coalesce. The result is a full
-- sequential scan of direct_quotes for every row evaluated, chained through a
-- 4-table join (trip_messages → trip_conversations → trips → direct_quotes →
-- organization_members). On MICRO (256MB, ~60 connections) this exhausts the
-- connection pool and causes the cascade outage seen in logs as statement timeouts.
--
-- Fix:
--   1. Replace the wrapped expression with a plain equality check. The schema
--      CHECK constraint already guarantees status IN ('pending','accepted','rejected'),
--      so lower/trim/coalesce are redundant.
--   2. Add a composite partial index to make the accepted-quote lookup instant.

-- ── 1. Fast index for the accepted-quote RLS hot path ─────────────────────────
-- Covers: dq.indent_id = t.indent_id AND dq.status = 'accepted'
--         dq.bidder_organization_id = ? AND dq.status = 'accepted'
CREATE INDEX IF NOT EXISTS idx_direct_quotes_accepted_indent
  ON public.direct_quotes (indent_id, bidder_organization_id)
  WHERE status = 'accepted';

-- ── 2. trip_conversations: fix non-sargable supplier-via-indent policy ─────────
DROP POLICY IF EXISTS "Linked supplier via indent reads trip conversations" ON public.trip_conversations;

CREATE POLICY "Linked supplier via indent reads trip conversations"
  ON public.trip_conversations
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.trips t
      INNER JOIN public.indents i ON i.id = t.indent_id
      INNER JOIN public.direct_quotes dq
        ON dq.indent_id = i.id
       AND dq.status = 'accepted'
      INNER JOIN public.organization_members om
        ON om.organization_id = dq.bidder_organization_id
       AND om.user_id = auth.uid()
       AND om.status = 'active'
      WHERE t.id = trip_conversations.trip_id
        AND t.supplier_id IS NULL
        AND t.indent_id IS NOT NULL
    )
  );

-- ── 3. trip_messages: fix non-sargable supplier-via-indent read policy ─────────
DROP POLICY IF EXISTS "Linked supplier via indent reads trip messages" ON public.trip_messages;

CREATE POLICY "Linked supplier via indent reads trip messages"
  ON public.trip_messages
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.trip_conversations tc
      INNER JOIN public.trips t ON t.id = tc.trip_id
      INNER JOIN public.indents i ON i.id = t.indent_id
      INNER JOIN public.direct_quotes dq
        ON dq.indent_id = i.id
       AND dq.status = 'accepted'
      INNER JOIN public.organization_members om
        ON om.organization_id = dq.bidder_organization_id
       AND om.user_id = auth.uid()
       AND om.status = 'active'
      WHERE tc.id = trip_messages.conversation_id
        AND t.supplier_id IS NULL
        AND t.indent_id IS NOT NULL
    )
  );

-- ── 4. trip_messages: fix non-sargable supplier insert policy ─────────────────
DROP POLICY IF EXISTS "Linked supplier inserts supplier in driver thread" ON public.trip_messages;

CREATE POLICY "Linked supplier inserts supplier in driver thread"
  ON public.trip_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    sender_role = 'supplier'
    AND organization_id = (
      SELECT tc.organization_id
      FROM public.trip_conversations tc
      WHERE tc.id = trip_messages.conversation_id
    )
    AND (
      EXISTS (
        SELECT 1
        FROM public.trip_conversations tc
        INNER JOIN public.trips t ON t.id = tc.trip_id
        INNER JOIN public.suppliers s ON s.id = t.supplier_id
        INNER JOIN public.organization_members om
          ON om.user_id = auth.uid()
         AND om.organization_id = s.linked_organization_id
         AND om.status = 'active'
        WHERE tc.id = trip_messages.conversation_id
          AND tc.party_type = 'driver'
      )
      OR EXISTS (
        SELECT 1
        FROM public.trip_conversations tc
        INNER JOIN public.trips t ON t.id = tc.trip_id
        INNER JOIN public.indents i ON i.id = t.indent_id
        INNER JOIN public.direct_quotes dq
          ON dq.indent_id = i.id
         AND dq.status = 'accepted'
        INNER JOIN public.organization_members om
          ON om.organization_id = dq.bidder_organization_id
         AND om.user_id = auth.uid()
         AND om.status = 'active'
        WHERE tc.id = trip_messages.conversation_id
          AND tc.party_type = 'driver'
          AND t.supplier_id IS NULL
          AND t.indent_id IS NOT NULL
      )
    )
  );

-- ── 5. trip_conversations: fix non-sargable linked-supplier-org policy ─────────
DROP POLICY IF EXISTS "Linked supplier org reads trip conversations for supplied trips" ON public.trip_conversations;

CREATE POLICY "Linked supplier org reads trip conversations for supplied trips"
  ON public.trip_conversations
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.trips t
      INNER JOIN public.suppliers s ON s.id = t.supplier_id
      INNER JOIN public.organization_members om
        ON om.user_id = auth.uid()
       AND om.organization_id = s.linked_organization_id
       AND COALESCE(om.status, 'active') = 'active'
      WHERE t.id = trip_conversations.trip_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.trips t
      INNER JOIN public.indents i ON i.id = t.indent_id
      INNER JOIN public.direct_quotes dq
        ON dq.indent_id = i.id
       AND dq.status = 'accepted'
      INNER JOIN public.organization_members om
        ON om.user_id = auth.uid()
       AND om.organization_id = dq.bidder_organization_id
       AND COALESCE(om.status, 'active') = 'active'
      WHERE t.id = trip_conversations.trip_id
        AND t.indent_id IS NOT NULL
    )
  );

-- ── 6. trip_messages: fix non-sargable linked-supplier-org read policy ─────────
DROP POLICY IF EXISTS "Linked supplier org reads trip messages for supplied trips" ON public.trip_messages;

CREATE POLICY "Linked supplier org reads trip messages for supplied trips"
  ON public.trip_messages
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.trip_conversations tc
      INNER JOIN public.trips t ON t.id = tc.trip_id
      INNER JOIN public.suppliers s ON s.id = t.supplier_id
      INNER JOIN public.organization_members om
        ON om.user_id = auth.uid()
       AND om.organization_id = s.linked_organization_id
       AND COALESCE(om.status, 'active') = 'active'
      WHERE tc.id = trip_messages.conversation_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.trip_conversations tc
      INNER JOIN public.trips t ON t.id = tc.trip_id
      INNER JOIN public.indents i ON i.id = t.indent_id
      INNER JOIN public.direct_quotes dq
        ON dq.indent_id = i.id
       AND dq.status = 'accepted'
      INNER JOIN public.organization_members om
        ON om.user_id = auth.uid()
       AND om.organization_id = dq.bidder_organization_id
       AND COALESCE(om.status, 'active') = 'active'
      WHERE tc.id = trip_messages.conversation_id
        AND t.indent_id IS NOT NULL
    )
  );

-- ── 7. trip_messages: fix non-sargable linked-supplier-org insert policy ───────
DROP POLICY IF EXISTS "Linked supplier org inserts supplier party messages" ON public.trip_messages;

CREATE POLICY "Linked supplier org inserts supplier party messages"
  ON public.trip_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    sender_role = 'supplier'
    AND organization_id = (
      SELECT tc.organization_id
      FROM public.trip_conversations tc
      WHERE tc.id = trip_messages.conversation_id
    )
    AND (
      EXISTS (
        SELECT 1
        FROM public.trip_conversations tc
        INNER JOIN public.trips t ON t.id = tc.trip_id
        INNER JOIN public.suppliers s ON s.id = t.supplier_id AND s.id = tc.supplier_id
        INNER JOIN public.organization_members om
          ON om.user_id = auth.uid()
         AND om.organization_id = s.linked_organization_id
         AND COALESCE(om.status, 'active') = 'active'
        WHERE tc.id = trip_messages.conversation_id
          AND tc.party_type = 'supplier'
      )
      OR EXISTS (
        SELECT 1
        FROM public.trip_conversations tc
        INNER JOIN public.trips t ON t.id = tc.trip_id
        INNER JOIN public.indents i ON i.id = t.indent_id
        INNER JOIN public.direct_quotes dq
          ON dq.indent_id = i.id
         AND dq.status = 'accepted'
        INNER JOIN public.organization_members om
          ON om.user_id = auth.uid()
         AND om.organization_id = dq.bidder_organization_id
         AND COALESCE(om.status, 'active') = 'active'
        WHERE tc.id = trip_messages.conversation_id
          AND tc.party_type = 'supplier'
          AND t.indent_id IS NOT NULL
          AND tc.supplier_id IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM public.suppliers s2
            WHERE s2.id = tc.supplier_id
              AND s2.linked_organization_id = dq.bidder_organization_id
          )
      )
    )
  );

COMMENT ON INDEX idx_direct_quotes_accepted_indent IS
  'Partial index for RLS hot path: accepted-quote lookup by indent_id + bidder_organization_id.';
