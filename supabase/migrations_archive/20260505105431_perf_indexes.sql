-- Performance index improvements:
-- 1. Covering index on organization_members for RLS hot path
-- 2. Missing FK indexes on trip_conversations, clients, suppliers, indents, organizations
-- 3. Drop duplicate/unused indexes to reduce write amplification

-- ── 1. organization_members covering index ─────────────────────────────────────
-- Most RLS policies filter: user_id = (SELECT auth.uid()) AND status = 'active'
-- The existing separate user_id / organization_id indexes don't cover status.
CREATE INDEX IF NOT EXISTS idx_org_members_user_org_status
  ON public.organization_members(user_id, organization_id)
  WHERE status = 'active';

-- Secondary pattern: organization_id + user_id (supplier/client cross-org RLS)
CREATE INDEX IF NOT EXISTS idx_org_members_org_user
  ON public.organization_members(organization_id, user_id);

-- ── 2. Missing FK indexes ──────────────────────────────────────────────────────

-- trip_conversations: party lookups used in chat RLS policies
CREATE INDEX IF NOT EXISTS idx_trip_conversations_client_id
  ON public.trip_conversations(client_id) WHERE client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_trip_conversations_supplier_id
  ON public.trip_conversations(supplier_id) WHERE supplier_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_trip_conversations_driver_id
  ON public.trip_conversations(driver_id) WHERE driver_id IS NOT NULL;

-- clients / suppliers: cross-org linked_organization_id lookup (RLS + display)
CREATE INDEX IF NOT EXISTS idx_clients_linked_org
  ON public.clients(linked_organization_id) WHERE linked_organization_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_suppliers_linked_org
  ON public.suppliers(linked_organization_id) WHERE linked_organization_id IS NOT NULL;

-- indents: assigned_supplier_id used in completion/settlement flows
CREATE INDEX IF NOT EXISTS idx_indents_assigned_supplier
  ON public.indents(assigned_supplier_id) WHERE assigned_supplier_id IS NOT NULL;

-- organizations: owner_id FK
CREATE INDEX IF NOT EXISTS idx_organizations_owner_id
  ON public.organizations(owner_id);

-- ── 3. Drop duplicate / zero-use indexes ──────────────────────────────────────
-- idx_trip_messages_unread and idx_tripmsg_unread are identical filtered indexes;
-- both have had 0 scans since last stats reset. Drop the older duplicate.
DROP INDEX IF EXISTS public.idx_trip_messages_unread;

-- Driver location indexes that have never been scanned (0 scans).
-- Queries use the trip_id or driver_id+recorded_at compound indexes instead.
DROP INDEX IF EXISTS public.idx_driver_locations_org_recorded;
DROP INDEX IF EXISTS public.idx_driver_locations_trip_recorded;

-- Finance cover index: 0 scans — queries use per-column indexes on trips.
DROP INDEX IF EXISTS public.idx_trips_finance_cover;
