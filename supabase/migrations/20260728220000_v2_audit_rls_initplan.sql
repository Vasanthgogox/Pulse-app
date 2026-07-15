-- =============================================================================
-- V2 Audit Fix 3: RLS initplan optimization — replace bare auth.uid() with (SELECT auth.uid())
-- Affected: trip_conversations (3 policies), trip_messages (4 policies)
-- =============================================================================

-- trip_conversations: Linked client org
DROP POLICY IF EXISTS "Linked client org reads trip conversations" ON public.trip_conversations;
CREATE POLICY "Linked client org reads trip conversations"
  ON public.trip_conversations FOR SELECT
  USING (EXISTS (
    SELECT 1
    FROM trips t
    JOIN clients c ON c.id = t.client_id
    JOIN organization_members om ON (
      om.user_id = (SELECT auth.uid())
      AND om.organization_id = c.linked_organization_id
      AND (om.status = 'active' OR om.status IS NULL)
    )
    WHERE t.id = trip_conversations.trip_id
  ));

-- trip_conversations: Linked supplier org (had bare auth.uid in 2 sub-EXISTS)
DROP POLICY IF EXISTS "Linked supplier org reads trip conversations for supplied trips" ON public.trip_conversations;
CREATE POLICY "Linked supplier org reads trip conversations for supplied trips"
  ON public.trip_conversations FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM trips t
      JOIN suppliers s ON s.id = t.supplier_id
      JOIN organization_members om ON (
        om.user_id = (SELECT auth.uid())
        AND om.organization_id = s.linked_organization_id
        AND (om.status = 'active' OR om.status IS NULL)
      )
      WHERE t.id = trip_conversations.trip_id
    )
    OR EXISTS (
      SELECT 1
      FROM trips t
      JOIN indents i ON i.id = t.indent_id
      JOIN direct_quotes dq ON dq.indent_id = i.id AND dq.status = 'accepted'
      JOIN organization_members om ON (
        om.user_id = (SELECT auth.uid())
        AND om.organization_id = dq.bidder_organization_id
        AND (om.status = 'active' OR om.status IS NULL)
      )
      WHERE t.id = trip_conversations.trip_id
        AND t.indent_id IS NOT NULL
    )
  );

-- trip_conversations: Linked supplier via indent
DROP POLICY IF EXISTS "Linked supplier via indent reads trip conversations" ON public.trip_conversations;
CREATE POLICY "Linked supplier via indent reads trip conversations"
  ON public.trip_conversations FOR SELECT
  USING (EXISTS (
    SELECT 1
    FROM trips t
    JOIN indents i ON i.id = t.indent_id
    JOIN direct_quotes dq ON dq.indent_id = i.id AND dq.status = 'accepted'
    JOIN organization_members om ON (
      om.organization_id = dq.bidder_organization_id
      AND om.user_id = (SELECT auth.uid())
      AND (om.status = 'active' OR om.status IS NULL)
    )
    WHERE t.id = trip_conversations.trip_id
      AND t.supplier_id IS NULL
      AND t.indent_id IS NOT NULL
  ));

-- trip_messages: Linked client org
DROP POLICY IF EXISTS "Linked client org reads trip messages" ON public.trip_messages;
CREATE POLICY "Linked client org reads trip messages"
  ON public.trip_messages FOR SELECT
  USING (EXISTS (
    SELECT 1
    FROM trip_conversations tc
    JOIN trips t ON t.id = tc.trip_id
    JOIN clients c ON c.id = t.client_id
    JOIN organization_members om ON (
      om.user_id = (SELECT auth.uid())
      AND om.organization_id = c.linked_organization_id
      AND (om.status = 'active' OR om.status IS NULL)
    )
    WHERE tc.id = trip_messages.conversation_id
  ));

-- trip_messages: Linked supplier org
DROP POLICY IF EXISTS "Linked supplier org reads trip messages for supplied trips" ON public.trip_messages;
CREATE POLICY "Linked supplier org reads trip messages for supplied trips"
  ON public.trip_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM trip_conversations tc
      JOIN trips t ON t.id = tc.trip_id
      JOIN suppliers s ON s.id = t.supplier_id
      JOIN organization_members om ON (
        om.user_id = (SELECT auth.uid())
        AND om.organization_id = s.linked_organization_id
        AND (om.status = 'active' OR om.status IS NULL)
      )
      WHERE tc.id = trip_messages.conversation_id
    )
    OR EXISTS (
      SELECT 1
      FROM trip_conversations tc
      JOIN trips t ON t.id = tc.trip_id
      JOIN indents i ON i.id = t.indent_id
      JOIN direct_quotes dq ON dq.indent_id = i.id AND dq.status = 'accepted'
      JOIN organization_members om ON (
        om.user_id = (SELECT auth.uid())
        AND om.organization_id = dq.bidder_organization_id
        AND (om.status = 'active' OR om.status IS NULL)
      )
      WHERE tc.id = trip_messages.conversation_id
        AND t.indent_id IS NOT NULL
    )
  );

-- trip_messages: Linked supplier via indent
DROP POLICY IF EXISTS "Linked supplier via indent reads trip messages" ON public.trip_messages;
CREATE POLICY "Linked supplier via indent reads trip messages"
  ON public.trip_messages FOR SELECT
  USING (EXISTS (
    SELECT 1
    FROM trip_conversations tc
    JOIN trips t ON t.id = tc.trip_id
    JOIN indents i ON i.id = t.indent_id
    JOIN direct_quotes dq ON dq.indent_id = i.id AND dq.status = 'accepted'
    JOIN organization_members om ON (
      om.organization_id = dq.bidder_organization_id
      AND om.user_id = (SELECT auth.uid())
      AND (om.status = 'active' OR om.status IS NULL)
    )
    WHERE tc.id = trip_messages.conversation_id
      AND t.supplier_id IS NULL
      AND t.indent_id IS NOT NULL
  ));

-- trip_messages: org members manage
DROP POLICY IF EXISTS "organization_members_can_manage_trip_messages" ON public.trip_messages;
CREATE POLICY "organization_members_can_manage_trip_messages"
  ON public.trip_messages FOR ALL
  USING (EXISTS (
    SELECT 1
    FROM organization_members om
    WHERE om.user_id = (SELECT auth.uid())
      AND om.organization_id = trip_messages.organization_id
      AND (om.status = 'active' OR om.status IS NULL)
  ));
