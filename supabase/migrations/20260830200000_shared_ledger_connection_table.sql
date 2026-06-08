-- ─────────────────────────────────────────────────────────────────────────────
-- Shared Ledger Connection Table
--
-- Tracks bilateral ledger sharing agreements between organisations.
-- The app queries this table to discover partner orgs that can see
-- each other's trip/payment data in the shared ledger view.
--
-- Previously only the RPC `get_shared_ledger_connections` existed;
-- the service now queries this table directly (faster, cacheable).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.shared_ledger_connection (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_a_id   uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  org_b_id   uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  status     text        NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE', 'PENDING')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT shared_ledger_connection_unique UNIQUE (org_a_id, org_b_id),
  CONSTRAINT shared_ledger_no_self_link CHECK (org_a_id <> org_b_id)
);

CREATE INDEX IF NOT EXISTS idx_shared_ledger_conn_org_a ON public.shared_ledger_connection(org_a_id);
CREATE INDEX IF NOT EXISTS idx_shared_ledger_conn_org_b ON public.shared_ledger_connection(org_b_id);
CREATE INDEX IF NOT EXISTS idx_shared_ledger_conn_status ON public.shared_ledger_connection(status);

-- ── RLS ───────────────────────────────────────────────────────────────────────

ALTER TABLE public.shared_ledger_connection ENABLE ROW LEVEL SECURITY;

-- Org members can view connections involving their org
CREATE POLICY "org_members_view_shared_ledger_connections"
  ON public.shared_ledger_connection
  FOR SELECT
  USING (
    org_a_id IN (
      SELECT om.organization_id FROM public.organization_members om WHERE om.user_id = auth.uid()
    )
    OR
    org_b_id IN (
      SELECT om.organization_id FROM public.organization_members om WHERE om.user_id = auth.uid()
    )
  );

-- Only org owners/admins can create/modify connections
CREATE POLICY "org_admins_manage_shared_ledger_connections"
  ON public.shared_ledger_connection
  FOR ALL
  USING (
    org_a_id IN (
      SELECT om.organization_id FROM public.organization_members om
      WHERE om.user_id = auth.uid() AND om.role IN ('owner', 'admin')
    )
    OR
    org_b_id IN (
      SELECT om.organization_id FROM public.organization_members om
      WHERE om.user_id = auth.uid() AND om.role IN ('owner', 'admin')
    )
  );

-- ── Updated-at trigger ────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.update_shared_ledger_connection_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_shared_ledger_connection_updated_at
  BEFORE UPDATE ON public.shared_ledger_connection
  FOR EACH ROW EXECUTE FUNCTION public.update_shared_ledger_connection_updated_at();
