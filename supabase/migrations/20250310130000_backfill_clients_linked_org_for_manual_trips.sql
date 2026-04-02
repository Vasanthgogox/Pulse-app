-- Backfill clients.linked_organization_id so "trips where org is client" (Compare & Verify) can find manual trips.
-- When connection is approved, the trigger links suppliers in from_org and clients in to_org, but the client
-- record that represents the other party in the *supplier's* (from_org) clients table may have been created
-- manually earlier and never got linked_organization_id. This one-time update sets it when the client name
-- matches the linked org name and there is an active client_supplier relation (from_org = supplier, to_org = client).
-- Prerequisite: organization_relations must have (from_org, to_org, 'client_supplier', 'active') for the pair.
-- If no such relation exists, set linked_organization_id manually on the client row, e.g.:
--   UPDATE clients SET linked_organization_id = '<client_org_uuid>' WHERE id = '<client_id>';
-- For future: 20250310140000_connection_approval_link_client_by_name.sql updates the trigger
-- so new connection approvals link existing clients/suppliers by name; no further backfill needed.

UPDATE public.clients c
SET linked_organization_id = r.to_organization_id,
    updated_at = now()
FROM public.organization_relations r
JOIN public.organizations o ON o.id = r.to_organization_id
WHERE r.from_organization_id = c.organization_id
  AND r.relation_type = 'client_supplier'
  AND r.status = 'active'
  AND c.linked_organization_id IS NULL
  AND trim(lower(coalesce(c.name, ''))) = trim(lower(coalesce(o.name, '')));
