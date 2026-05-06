-- ============================================================
-- RLS INITPLAN FIX ROUND 2 — 2026-05-05
-- Fixes 10 policies introduced after the May 5 initplan fix
-- that still used raw auth.uid() (evaluated per row).
-- All replaced with (SELECT auth.uid()) — evaluated once per query.
--
-- Also adds composite index missed in round 1:
--   transactions(organization_id, contact_type, contact_id)
-- ============================================================

-- ── 1. trips: "Orgs can read trips where they are the supplier" ───────────────
DROP POLICY IF EXISTS "Orgs can read trips where they are the supplier" ON public.trips;

CREATE POLICY "Orgs can read trips where they are the supplier"
  ON public.trips
  FOR SELECT
  TO authenticated
  USING (
    trips.indent_id IS NOT NULL
    AND (
      EXISTS (
        SELECT 1
        FROM public.suppliers s
        WHERE s.id = trips.supplier_id
          AND s.linked_organization_id IS NOT NULL
          AND s.linked_organization_id IN (
            SELECT om.organization_id
            FROM public.organization_members om
            WHERE om.user_id = (SELECT auth.uid())
              AND COALESCE(om.status, 'active') = 'active'
          )
      )
      OR EXISTS (
        SELECT 1
        FROM public.direct_quotes dq
        WHERE dq.indent_id = trips.indent_id
          AND lower(trim(coalesce(dq.status, ''))) = 'accepted'
          AND dq.bidder_organization_id IN (
            SELECT om.organization_id
            FROM public.organization_members om
            WHERE om.user_id = (SELECT auth.uid())
              AND COALESCE(om.status, 'active') = 'active'
          )
      )
    )
  );

COMMENT ON POLICY "Orgs can read trips where they are the supplier" ON public.trips IS
  'Supplier org: indent trips where they are linked supplier OR accepted bidder on the indent.';

-- ── 2. trip_conversations: "Linked supplier org reads trip conversations for supplied trips" ──
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
        ON om.user_id = (SELECT auth.uid())
       AND om.organization_id = s.linked_organization_id
       AND COALESCE(om.status, 'active') = 'active'
      WHERE t.id = trip_conversations.trip_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.trips t
      INNER JOIN public.direct_quotes dq
        ON dq.indent_id = t.indent_id
       AND lower(trim(coalesce(dq.status, ''))) = 'accepted'
      INNER JOIN public.organization_members om
        ON om.user_id = (SELECT auth.uid())
       AND om.organization_id = dq.bidder_organization_id
       AND COALESCE(om.status, 'active') = 'active'
      WHERE t.id = trip_conversations.trip_id
        AND t.indent_id IS NOT NULL
    )
  );

COMMENT ON POLICY "Linked supplier org reads trip conversations for supplied trips" ON public.trip_conversations IS
  'Supplier org: SELECT conversations for supplied indent trips (linked supplier row OR accepted bidder).';

-- ── 3. trip_messages SELECT: "Linked supplier org reads trip messages for supplied trips" ──
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
        ON om.user_id = (SELECT auth.uid())
       AND om.organization_id = s.linked_organization_id
       AND COALESCE(om.status, 'active') = 'active'
      WHERE tc.id = trip_messages.conversation_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.trip_conversations tc
      INNER JOIN public.trips t ON t.id = tc.trip_id
      INNER JOIN public.direct_quotes dq
        ON dq.indent_id = t.indent_id
       AND lower(trim(coalesce(dq.status, ''))) = 'accepted'
      INNER JOIN public.organization_members om
        ON om.user_id = (SELECT auth.uid())
       AND om.organization_id = dq.bidder_organization_id
       AND COALESCE(om.status, 'active') = 'active'
      WHERE tc.id = trip_messages.conversation_id
        AND t.indent_id IS NOT NULL
    )
  );

COMMENT ON POLICY "Linked supplier org reads trip messages for supplied trips" ON public.trip_messages IS
  'Supplier org: read messages for those conversations.';

-- ── 4. trip_messages INSERT: "Linked supplier org inserts supplier party messages" ──
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
          ON om.user_id = (SELECT auth.uid())
         AND om.organization_id = s.linked_organization_id
         AND COALESCE(om.status, 'active') = 'active'
        WHERE tc.id = trip_messages.conversation_id
          AND tc.party_type = 'supplier'
      )
      OR EXISTS (
        SELECT 1
        FROM public.trip_conversations tc
        INNER JOIN public.trips t ON t.id = tc.trip_id
        INNER JOIN public.direct_quotes dq
          ON dq.indent_id = t.indent_id
         AND lower(trim(coalesce(dq.status, ''))) = 'accepted'
        INNER JOIN public.organization_members om
          ON om.user_id = (SELECT auth.uid())
         AND om.organization_id = dq.bidder_organization_id
         AND COALESCE(om.status, 'active') = 'active'
        WHERE tc.id = trip_messages.conversation_id
          AND tc.party_type = 'supplier'
          AND t.indent_id IS NOT NULL
          AND tc.supplier_id IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM public.suppliers s2
            WHERE s2.id = tc.supplier_id
              AND s2.linked_organization_id = dq.bidder_organization_id
          )
      )
    )
  );

COMMENT ON POLICY "Linked supplier org inserts supplier party messages" ON public.trip_messages IS
  'Supplier org: post as supplier on supplier party thread when linked or accepted bidder matches.';

-- ── 5. trip_conversations: "Linked supplier via indent reads trip conversations" ──
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
      INNER JOIN public.organization_members om
        ON om.organization_id = i.assigned_supplier_id
       AND om.user_id = (SELECT auth.uid())
       AND om.status = 'active'
      WHERE t.id = trip_conversations.trip_id
        AND t.supplier_id IS NULL
        AND t.indent_id IS NOT NULL
        AND i.assigned_supplier_id IS NOT NULL
    )
  );

COMMENT ON POLICY "Linked supplier via indent reads trip conversations" ON public.trip_conversations IS
  'Executing org (indents.assigned_supplier_id -> organizations) can read threads when trips.supplier_id is NULL.';

-- ── 6. trip_messages SELECT: "Linked supplier via indent reads trip messages" ──
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
      INNER JOIN public.organization_members om
        ON om.organization_id = i.assigned_supplier_id
       AND om.user_id = (SELECT auth.uid())
       AND om.status = 'active'
      WHERE tc.id = trip_messages.conversation_id
        AND t.supplier_id IS NULL
        AND t.indent_id IS NOT NULL
        AND i.assigned_supplier_id IS NOT NULL
    )
  );

COMMENT ON POLICY "Linked supplier via indent reads trip messages" ON public.trip_messages IS
  'Read driver/client/etc. threads for indent trips where supplier_id is still NULL.';

-- ── 7. trip_messages INSERT: "Linked supplier inserts supplier in driver thread" ──
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
          ON om.user_id = (SELECT auth.uid())
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
        INNER JOIN public.organization_members om
          ON om.organization_id = i.assigned_supplier_id
         AND om.user_id = (SELECT auth.uid())
         AND om.status = 'active'
        WHERE tc.id = trip_messages.conversation_id
          AND tc.party_type = 'driver'
          AND t.supplier_id IS NULL
          AND t.indent_id IS NOT NULL
          AND i.assigned_supplier_id IS NOT NULL
      )
    )
  );

COMMENT ON POLICY "Linked supplier inserts supplier in driver thread" ON public.trip_messages IS
  'Direct-insert fallback: supplier posts in shipper-owned driver thread (RPC preferred).';

-- ── 8. storage.objects: "Org members can read trip documents by folder" ────────
DROP POLICY IF EXISTS "Org members can read trip documents by folder" ON storage.objects;

CREATE POLICY "Org members can read trip documents by folder"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'trip-documents'
  AND EXISTS (
    SELECT 1
    FROM public.trips t
    INNER JOIN public.organization_members om
      ON om.organization_id = t.organization_id
      AND om.user_id = (SELECT auth.uid())
      AND COALESCE(om.status, 'active') = 'active'
    WHERE t.id::text = (storage.foldername(name))[1]
  )
);

-- ── 9. suppliers: "Drivers can read suppliers linked to assigned trips" ─────────
DROP POLICY IF EXISTS "Drivers can read suppliers linked to assigned trips" ON public.suppliers;

CREATE POLICY "Drivers can read suppliers linked to assigned trips"
  ON public.suppliers
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.trips t
      INNER JOIN public.drivers d ON d.id = t.driver_id AND d.user_id = (SELECT auth.uid())
      WHERE t.supplier_id = suppliers.id
    )
  );

COMMENT ON POLICY "Drivers can read suppliers linked to assigned trips" ON public.suppliers IS
  'Cross-org aggregate trips: driver JWT is not org_member(trip.organization_id); still need to resolve supplier_id for completion validation.';

-- ── 10. transactions: "Drivers can read supplier transactions for assigned trips" ──
DROP POLICY IF EXISTS "Drivers can read supplier transactions for assigned trips" ON public.transactions;

CREATE POLICY "Drivers can read supplier transactions for assigned trips"
  ON public.transactions
  FOR SELECT
  USING (
    transactions.contact_type = 'supplier'
    AND EXISTS (
      SELECT 1
      FROM public.trips t
      INNER JOIN public.drivers d ON d.id = t.driver_id AND d.user_id = (SELECT auth.uid())
      WHERE t.id = transactions.trip_id
    )
  );

COMMENT ON POLICY "Drivers can read supplier transactions for assigned trips" ON public.transactions IS
  'Same as suppliers policy: completion validation falls back to supplier contact_type transactions.';

-- ── 11. Missing composite index on transactions ───────────────────────────────
CREATE INDEX IF NOT EXISTS idx_transactions_org_contact
  ON public.transactions(organization_id, contact_type, contact_id)
  WHERE contact_id IS NOT NULL;
