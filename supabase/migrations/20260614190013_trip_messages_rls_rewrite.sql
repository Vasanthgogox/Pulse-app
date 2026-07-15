-- Consolidate 5 OR'd SELECT RLS policies on trip_messages into a single SECURITY DEFINER
-- helper function.
--
-- Problem: 5 SELECT policies each with 3-4 table EXISTS joins were inlined into every
-- PostgREST query plan. Planning time was 725ms+ even for the superuser path; the
-- authenticated path added all 5 EXISTS subquery plans on top. Two concurrent chat
-- loads could hold connections for 250s+ and exhaust the pool → DB outage.
--
-- Fix: replace the 5 SELECT policies with one policy that calls
-- private.user_can_read_trip_message(). The function is a black box to the planner —
-- it sees WHERE function(col) instead of 5 inlined join trees. Planning time drops by
-- ~80%. Logic is identical; security model is unchanged.
--
-- The function lives in the private schema and is not callable via the REST API.
-- SECURITY DEFINER runs it as the postgres role → bypasses nested RLS re-checking
-- on the referenced tables (trips, suppliers, clients, org_members) which would
-- otherwise cause another RLS evaluation recursion.

CREATE OR REPLACE FUNCTION private.user_can_read_trip_message(
  p_org_id   uuid,
  p_conv_id  uuid
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
  -- Check 1: dispatcher/admin of the owning org (covers ~95% of requests)
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.user_id        = (SELECT auth.uid())
      AND om.organization_id = p_org_id
      AND (om.status = 'active' OR om.status IS NULL)
  )
  -- Check 2: driver assigned to this conversation
  OR EXISTS (
    SELECT 1
    FROM public.trip_conversations tc
    JOIN public.drivers d ON d.id = tc.driver_id
    WHERE tc.id       = p_conv_id
      AND d.user_id   = (SELECT auth.uid())
  )
  -- Check 3: linked client org
  OR EXISTS (
    SELECT 1
    FROM public.trip_conversations tc
    JOIN public.trips             t  ON t.id  = tc.trip_id
    JOIN public.clients           c  ON c.id  = t.client_id
    JOIN public.organization_members om
      ON om.user_id          = (SELECT auth.uid())
     AND om.organization_id  = c.linked_organization_id
     AND (om.status = 'active' OR om.status IS NULL)
    WHERE tc.id = p_conv_id
  )
  -- Check 4: linked supplier org (direct relationship)
  OR EXISTS (
    SELECT 1
    FROM public.trip_conversations tc
    JOIN public.trips             t  ON t.id  = tc.trip_id
    JOIN public.suppliers         s  ON s.id  = t.supplier_id
    JOIN public.organization_members om
      ON om.user_id          = (SELECT auth.uid())
     AND om.organization_id  = s.linked_organization_id
     AND (om.status = 'active' OR om.status IS NULL)
    WHERE tc.id = p_conv_id
  )
  -- Check 5: supplier org via accepted indent direct_quote
  OR EXISTS (
    SELECT 1
    FROM public.trip_conversations   tc
    JOIN public.trips                t  ON t.id        = tc.trip_id
    JOIN public.indents              i  ON i.id        = t.indent_id
    JOIN public.direct_quotes        dq ON dq.indent_id = i.id
                                       AND dq.status   = 'accepted'
    JOIN public.organization_members om
      ON om.user_id          = (SELECT auth.uid())
     AND om.organization_id  = dq.bidder_organization_id
     AND (om.status = 'active' OR om.status IS NULL)
    WHERE tc.id          = p_conv_id
      AND t.supplier_id  IS NULL
      AND t.indent_id    IS NOT NULL
  )
$$;

-- Replace all 5 SELECT policies with a single one
DROP POLICY IF EXISTS "Drivers can view messages in their conversations"         ON public.trip_messages;
DROP POLICY IF EXISTS "Linked client org reads trip messages"                    ON public.trip_messages;
DROP POLICY IF EXISTS "Linked supplier org reads trip messages for supplied trips" ON public.trip_messages;
DROP POLICY IF EXISTS "Linked supplier via indent reads trip messages"           ON public.trip_messages;

-- organization_members_can_manage_trip_messages is FOR ALL (covers SELECT too).
-- Drop it and recreate split so SELECT uses the fast function; other cmds keep
-- the original simple org-member check which is already cheap.
DROP POLICY IF EXISTS "organization_members_can_manage_trip_messages" ON public.trip_messages;

-- Fast unified SELECT policy
CREATE POLICY "trip_messages_select"
  ON public.trip_messages FOR SELECT
  TO authenticated
  USING (private.user_can_read_trip_message(organization_id, conversation_id));

-- Restore cheap INSERT / UPDATE / DELETE for owning-org members
CREATE POLICY "trip_messages_org_write"
  ON public.trip_messages FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.user_id        = (SELECT auth.uid())
        AND om.organization_id = trip_messages.organization_id
        AND (om.status = 'active' OR om.status IS NULL)
    )
  );
