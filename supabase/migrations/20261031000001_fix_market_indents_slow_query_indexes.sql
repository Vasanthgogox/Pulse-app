-- Fix: market_indents_for_org RPC was slow (~4.7s) due to missing composite indexes.
-- Three root causes:
--   1. organization_relations filtered on (to/from_org, relation_type, status) with only single-col indexes
--   2. direct_quotes EXISTS correlated subquery with no covering index
--   3. indents JOIN paths lacked filtered composite indexes

CREATE INDEX IF NOT EXISTS idx_org_relations_to_type_status
  ON public.organization_relations (to_organization_id, relation_type, status)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_org_relations_from_type_status
  ON public.organization_relations (from_organization_id, relation_type, status)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_direct_quotes_indent_bidder_status
  ON public.direct_quotes (indent_id, bidder_organization_id, status)
  WHERE status = 'accepted';

CREATE INDEX IF NOT EXISTS idx_clients_org_active_linked
  ON public.clients (organization_id, linked_organization_id)
  WHERE status = 'active' AND linked_organization_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_indents_market_link
  ON public.indents (organization_id, created_at DESC)
  WHERE deleted_at IS NULL
    AND status <> 'draft'
    AND circulation_target IN ('integrated_supplier', 'both');

CREATE INDEX IF NOT EXISTS idx_indents_market_award
  ON public.indents (assigned_supplier_id, created_at DESC)
  WHERE deleted_at IS NULL
    AND status <> 'draft'
    AND assigned_supplier_id IS NOT NULL;
