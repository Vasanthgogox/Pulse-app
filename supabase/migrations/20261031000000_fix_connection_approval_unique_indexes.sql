-- The on_connection_request_approved trigger uses:
--   ON CONFLICT (organization_id, linked_organization_id) WHERE linked_organization_id IS NOT NULL
-- This requires UNIQUE partial indexes, but only plain indexes existed, causing
-- "there is no unique or exclusion constraint matching the ON CONFLICT specification".

CREATE UNIQUE INDEX IF NOT EXISTS uq_suppliers_org_linked_org
  ON public.suppliers (organization_id, linked_organization_id)
  WHERE linked_organization_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_clients_org_linked_org
  ON public.clients (organization_id, linked_organization_id)
  WHERE linked_organization_id IS NOT NULL;
