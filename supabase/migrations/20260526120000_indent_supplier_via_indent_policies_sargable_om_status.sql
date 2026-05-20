-- Re-apply indent-linked supplier read policies with sargable org_members status.
-- Some environments still had COALESCE(om.status, 'active') on these policies (non-index-friendly);
-- aligns with 20260509130000 (active OR NULL) and direct_quotes.status = 'accepted'.

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
       AND (om.status = 'active' OR om.status IS NULL)
      WHERE t.id = trip_conversations.trip_id
        AND t.supplier_id IS NULL
        AND t.indent_id IS NOT NULL
    )
  );

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
       AND (om.status = 'active' OR om.status IS NULL)
      WHERE tc.id = trip_messages.conversation_id
        AND t.supplier_id IS NULL
        AND t.indent_id IS NOT NULL
    )
  );

COMMENT ON POLICY "Linked supplier via indent reads trip conversations" ON public.trip_conversations IS
  'Accepted direct_quote bidder org can read threads for indent trips with NULL supplier_id; om.status sargable.';

COMMENT ON POLICY "Linked supplier via indent reads trip messages" ON public.trip_messages IS
  'Same as conversations policy for trip_messages SELECT.';
