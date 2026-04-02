-- Allow an org to SELECT trips where they are the client (clients.linked_organization_id = org),
-- only when trip source is 'manual'. Needed so when Mukunt (client) logs in and opens Compare & Verify
-- with Nihas (supplier/trip owner), they can see manually created trips where Mukunt is the client.

DROP POLICY IF EXISTS "Orgs can read trips where they are the client" ON public.trips;

CREATE POLICY "Orgs can read trips where they are the client"
  ON public.trips FOR SELECT
  USING (
    trips.source = 'manual'
    AND EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = trips.client_id
        AND c.linked_organization_id IS NOT NULL
        AND c.linked_organization_id IN (
          SELECT om.organization_id FROM public.organization_members om
          WHERE om.user_id = auth.uid() AND om.status = 'active'
        )
    )
  );

COMMENT ON POLICY "Orgs can read trips where they are the client" ON public.trips IS
  'Client org can see manual trips (source = manual) where the client has linked_organization_id = their org (Compare & Verify).';
