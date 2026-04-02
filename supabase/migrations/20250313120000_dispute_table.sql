-- dispute: shared ledger dispute rows for Compare & Verify.
-- Raiser (raised_by_org_id) can INSERT; receiver (partner_org_id) can SELECT and UPDATE (resolve).
-- One OPEN dispute per (transaction_id, raised_by_org_id, partner_org_id).
-- See docs/SHARED_LEDGER_BACKEND_CONTRACT.md.

CREATE TABLE IF NOT EXISTS public.dispute (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL,
  raised_by_org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  partner_org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'RESOLVED', 'WITHDRAWN')),
  internal_snapshot numeric NOT NULL DEFAULT 0,
  partner_snapshot numeric NOT NULL DEFAULT 0,
  raised_sales numeric DEFAULT 0,
  raised_paid numeric DEFAULT 0,
  evidence_url text,
  reason_code text,
  proposed_amount numeric,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dispute_raised_by ON public.dispute(raised_by_org_id);
CREATE INDEX IF NOT EXISTS idx_dispute_partner ON public.dispute(partner_org_id);
CREATE INDEX IF NOT EXISTS idx_dispute_status ON public.dispute(status);

-- One OPEN dispute per (transaction_id, raised_by_org_id, partner_org_id)
CREATE UNIQUE INDEX IF NOT EXISTS idx_dispute_one_open_per_trip_pair
  ON public.dispute(transaction_id, raised_by_org_id, partner_org_id)
  WHERE status = 'OPEN';

CREATE TRIGGER set_dispute_updated_at
  BEFORE UPDATE ON public.dispute
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.dispute IS 'Shared ledger disputes. Raiser inserts; partner can resolve (ACCEPT/DECLINE).';

-- RLS
ALTER TABLE public.dispute ENABLE ROW LEVEL SECURITY;

-- Raiser (raised_by_org_id) can INSERT
CREATE POLICY dispute_insert_raiser
  ON public.dispute FOR INSERT
  TO authenticated
  WITH CHECK (public.is_org_member(raised_by_org_id));

-- Either org can SELECT (raiser sees "disputes raised", partner sees "disputes received")
CREATE POLICY dispute_select_raiser_or_partner
  ON public.dispute FOR SELECT
  TO authenticated
  USING (
    public.is_org_member(raised_by_org_id)
    OR public.is_org_member(partner_org_id)
  );

-- Partner (partner_org_id) can UPDATE (e.g. resolve: set status to RESOLVED)
CREATE POLICY dispute_update_partner
  ON public.dispute FOR UPDATE
  TO authenticated
  USING (public.is_org_member(partner_org_id))
  WITH CHECK (public.is_org_member(partner_org_id));

GRANT INSERT, SELECT, UPDATE ON public.dispute TO authenticated;
