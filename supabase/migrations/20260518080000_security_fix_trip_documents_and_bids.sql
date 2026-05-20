-- SECURITY FIX: SEC-4 + SEC-6
-- trip_documents: consolidate 5 loose policies into one with explicit org membership check.
-- bids: split update policy so bidders manage own bids; post-owners use the accept_bid RPC.

-- ── SEC-4: trip_documents ──────────────────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated users can delete trip documents for their trips" ON trip_documents;
DROP POLICY IF EXISTS "Authenticated users can insert trip documents for their trips" ON trip_documents;
DROP POLICY IF EXISTS "Authenticated users can manage trip documents for their trips" ON trip_documents;
DROP POLICY IF EXISTS "Authenticated users can select trip documents for visible trips" ON trip_documents;
DROP POLICY IF EXISTS "Users can read trip_documents for trips they can read" ON trip_documents;

DROP POLICY IF EXISTS "trip_documents_org_member_manage" ON trip_documents;
CREATE POLICY "trip_documents_org_member_manage" ON trip_documents
FOR ALL TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.trips t
  JOIN public.organization_members om ON om.organization_id = t.organization_id
  WHERE t.id = trip_documents.trip_id
    AND om.user_id = (SELECT auth.uid())
    AND om.status = 'active'
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.trips t
  JOIN public.organization_members om ON om.organization_id = t.organization_id
  WHERE t.id = trip_documents.trip_id
    AND om.user_id = (SELECT auth.uid())
    AND om.status = 'active'
));

-- ── SEC-6: bids UPDATE ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS "bids_update" ON bids;

-- Bidders can only modify their own bids (withdraw / update amount while pending)
DROP POLICY IF EXISTS "bids_update_by_bidder" ON bids;
CREATE POLICY "bids_update_by_bidder" ON bids
FOR UPDATE TO authenticated
USING (
  bidder_organization_id IN (
    SELECT om.organization_id FROM public.organization_members om
    WHERE om.user_id = (SELECT auth.uid()) AND om.status = 'active'
  )
)
WITH CHECK (
  bidder_organization_id IN (
    SELECT om.organization_id FROM public.organization_members om
    WHERE om.user_id = (SELECT auth.uid()) AND om.status = 'active'
  )
  AND status IN ('pending', 'withdrawn')
);
-- Note: post owners accept bids via the accept_bid() SECURITY DEFINER RPC, not direct UPDATE.
