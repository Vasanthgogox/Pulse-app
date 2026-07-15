-- Same RLS consolidation applied to trip_messages (20260614190013) now applied to
-- trip_conversations, which has the identical 5-policy pattern.
--
-- trip_conversations is loaded every time chat opens (conversation list) — higher
-- frequency than individual message reads. Planning overhead was the same root cause.

CREATE OR REPLACE FUNCTION private.user_can_read_trip_conversation(
  p_org_id    uuid,
  p_trip_id   uuid,
  p_driver_id uuid
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
  -- Check 1: dispatcher/admin of the owning org (~95% of requests)
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.user_id         = (SELECT auth.uid())
      AND om.organization_id = p_org_id
      AND (om.status = 'active' OR om.status IS NULL)
  )
  -- Check 2: driver assigned to this conversation
  OR (
    p_driver_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.drivers d
      WHERE d.id      = p_driver_id
        AND d.user_id = (SELECT auth.uid())
    )
  )
  -- Check 3: linked client org
  OR EXISTS (
    SELECT 1
    FROM public.trips             t
    JOIN public.clients           c  ON c.id  = t.client_id
    JOIN public.organization_members om
      ON om.user_id          = (SELECT auth.uid())
     AND om.organization_id  = c.linked_organization_id
     AND (om.status = 'active' OR om.status IS NULL)
    WHERE t.id = p_trip_id
  )
  -- Check 4: linked supplier org (direct relationship)
  OR EXISTS (
    SELECT 1
    FROM public.trips             t
    JOIN public.suppliers         s  ON s.id  = t.supplier_id
    JOIN public.organization_members om
      ON om.user_id          = (SELECT auth.uid())
     AND om.organization_id  = s.linked_organization_id
     AND (om.status = 'active' OR om.status IS NULL)
    WHERE t.id = p_trip_id
  )
  -- Check 5: supplier org via accepted indent direct_quote
  OR EXISTS (
    SELECT 1
    FROM public.trips                t
    JOIN public.indents              i  ON i.id        = t.indent_id
    JOIN public.direct_quotes        dq ON dq.indent_id = i.id
                                       AND dq.status   = 'accepted'
    JOIN public.organization_members om
      ON om.user_id          = (SELECT auth.uid())
     AND om.organization_id  = dq.bidder_organization_id
     AND (om.status = 'active' OR om.status IS NULL)
    WHERE t.id          = p_trip_id
      AND t.supplier_id IS NULL
      AND t.indent_id   IS NOT NULL
  )
$$;

-- Replace the 4 SELECT-only policies
DROP POLICY IF EXISTS "Drivers can view their own trip conversations"                     ON public.trip_conversations;
DROP POLICY IF EXISTS "Linked client org reads trip conversations"                        ON public.trip_conversations;
DROP POLICY IF EXISTS "Linked supplier org reads trip conversations for supplied trips"   ON public.trip_conversations;
DROP POLICY IF EXISTS "Linked supplier via indent reads trip conversations"               ON public.trip_conversations;

-- Drop and split the ALL policy (same approach as trip_messages)
DROP POLICY IF EXISTS "organization_members_can_manage_trip_conversations" ON public.trip_conversations;

-- Unified SELECT policy
CREATE POLICY "trip_conversations_select"
  ON public.trip_conversations FOR SELECT
  TO authenticated
  USING (private.user_can_read_trip_conversation(organization_id, trip_id, driver_id));

-- Cheap write policy for owning-org members
CREATE POLICY "trip_conversations_org_write"
  ON public.trip_conversations FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.user_id         = (SELECT auth.uid())
        AND om.organization_id = trip_conversations.organization_id
        AND (om.status = 'active' OR om.status IS NULL)
    )
  );
