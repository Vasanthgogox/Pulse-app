-- ─────────────────────────────────────────────────────────────────────────────
-- Wave 1 Gap Closure: Invoice Sequences + Supplier Bills + Opening Balances
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Invoice sequences (GST compliance) ────────────────────────────────────
--
-- Indian GST Act (CGST Rule 46) requires consecutive serial invoice numbers
-- within a financial year. This table enforces that constraint.

CREATE TABLE IF NOT EXISTS public.invoice_sequences (
  org_id          uuid    NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  financial_year  text    NOT NULL,   -- e.g. '2025-26', '2026-27'
  last_seq        bigint  NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, financial_year)
);

CREATE INDEX IF NOT EXISTS idx_invoice_seq_org ON public.invoice_sequences(org_id);

ALTER TABLE public.invoice_sequences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_members_manage_invoice_seq"
  ON public.invoice_sequences FOR ALL
  USING (
    org_id IN (
      SELECT om.organization_id FROM public.organization_members om
      WHERE om.user_id = auth.uid()
    )
  );

-- Atomically allocate the next invoice number for an org in a financial year.
-- Returns: 'INV/2025-26/00042'
CREATE OR REPLACE FUNCTION public.allocate_invoice_number(
  p_org_id       uuid,
  p_financial_yr text DEFAULT NULL   -- auto-derive if null
)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fy   text;
  v_seq  bigint;
BEGIN
  -- Derive financial year from current date (India: Apr–Mar)
  IF p_financial_yr IS NULL THEN
    IF extract(month FROM now()) >= 4 THEN
      v_fy := extract(year FROM now())::text || '-' ||
              right((extract(year FROM now())::int + 1)::text, 2);
    ELSE
      v_fy := (extract(year FROM now())::int - 1)::text || '-' ||
              right(extract(year FROM now())::text, 2);
    END IF;
  ELSE
    v_fy := p_financial_yr;
  END IF;

  -- Atomic increment (INSERT … ON CONFLICT UPDATE)
  INSERT INTO public.invoice_sequences (org_id, financial_year, last_seq)
  VALUES (p_org_id, v_fy, 1)
  ON CONFLICT (org_id, financial_year)
  DO UPDATE SET last_seq = invoice_sequences.last_seq + 1
  RETURNING last_seq INTO v_seq;

  RETURN 'INV/' || v_fy || '/' || lpad(v_seq::text, 5, '0');
END;
$$;

GRANT EXECUTE ON FUNCTION public.allocate_invoice_number(uuid, text) TO authenticated;

-- ── 2. Store generated invoice numbers (prevent duplicates) ──────────────────

CREATE TABLE IF NOT EXISTS public.invoices (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  invoice_number  text        NOT NULL,
  financial_year  text        NOT NULL,
  client_id       uuid        REFERENCES public.clients(id),
  client_name     text,
  invoice_date    date        NOT NULL DEFAULT CURRENT_DATE,
  due_date        date,
  trip_ids        uuid[]      NOT NULL DEFAULT '{}',
  subtotal        numeric(12,2) NOT NULL DEFAULT 0,
  gst_rate        numeric(5,2)  NOT NULL DEFAULT 0,
  sgst_amount     numeric(12,2) NOT NULL DEFAULT 0,
  cgst_amount     numeric(12,2) NOT NULL DEFAULT 0,
  igst_amount     numeric(12,2) NOT NULL DEFAULT 0,
  total_amount    numeric(12,2) NOT NULL DEFAULT 0,
  notes           text,
  status          text        NOT NULL DEFAULT 'draft',  -- draft | sent | paid | void
  pdf_storage_path text,
  created_by      uuid        REFERENCES auth.users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT invoices_number_unique UNIQUE (org_id, invoice_number),
  CONSTRAINT invoices_status_check CHECK (status IN ('draft','sent','paid','cancelled','void'))
);

CREATE INDEX IF NOT EXISTS idx_invoices_org_date ON public.invoices(org_id, invoice_date DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_client   ON public.invoices(client_id) WHERE client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_status   ON public.invoices(org_id, status);

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_members_manage_invoices"
  ON public.invoices FOR ALL
  USING (
    org_id IN (
      SELECT om.organization_id FROM public.organization_members om
      WHERE om.user_id = auth.uid()
    )
  );

-- ── 3. Supplier bills (payable workflow) ─────────────────────────────────────
--
-- Gap: Supplier payments had no bill reference. Now every payment can reference
-- a supplier bill with bill_number, bill_date, and approval status.

CREATE TABLE IF NOT EXISTS public.supplier_bills (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  supplier_id     uuid        REFERENCES public.suppliers(id),
  supplier_name   text,
  bill_number     text        NOT NULL,
  bill_date       date        NOT NULL DEFAULT CURRENT_DATE,
  trip_ids        uuid[]      NOT NULL DEFAULT '{}',
  gross_amount    numeric(12,2) NOT NULL DEFAULT 0,
  tds_percent     numeric(5,2)  NOT NULL DEFAULT 0,     -- Section 194C: 1% individual, 2% company
  tds_amount      numeric(12,2) NOT NULL DEFAULT 0,
  net_payable     numeric(12,2) NOT NULL DEFAULT 0,
  advance_paid    numeric(12,2) NOT NULL DEFAULT 0,
  balance_payable numeric(12,2) GENERATED ALWAYS AS (net_payable - advance_paid) STORED,
  notes           text,
  status          text        NOT NULL DEFAULT 'pending',  -- pending | approved | paid | cancelled
  approved_by     uuid        REFERENCES auth.users(id),
  approved_at     timestamptz,
  created_by      uuid        REFERENCES auth.users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT supplier_bills_status_check CHECK (status IN ('pending','approved','paid','cancelled'))
);

CREATE INDEX IF NOT EXISTS idx_supplier_bills_org      ON public.supplier_bills(org_id, bill_date DESC);
CREATE INDEX IF NOT EXISTS idx_supplier_bills_supplier ON public.supplier_bills(supplier_id) WHERE supplier_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_supplier_bills_status   ON public.supplier_bills(org_id, status);

ALTER TABLE public.supplier_bills ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_members_manage_supplier_bills"
  ON public.supplier_bills FOR ALL
  USING (
    org_id IN (
      SELECT om.organization_id FROM public.organization_members om
      WHERE om.user_id = auth.uid()
    )
  );

-- ── 4. Opening balances on transactions ──────────────────────────────────────
--
-- Gap: No opening balance when onboarding an existing company.
-- Fix: Add 'opening_balance' as a reserved ledger_flow_type on transactions.
-- The UI creates an opening_balance transaction on client/supplier creation.
--
-- The transactions table already supports: contact_id, contact_type, amount_in, amount_out.
-- We extend ledger_flow_type to include 'opening_balance' and add a flag.

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS is_opening_balance boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_transactions_opening_balance
  ON public.transactions(organization_id, contact_id)
  WHERE is_opening_balance = true;

COMMENT ON COLUMN public.transactions.is_opening_balance IS
  'True for the synthetic opening balance entry created when onboarding an existing customer/supplier.
   These entries represent historical balance brought forward and are excluded from normal P&L calculations.';

-- ── 5. POD gate: add pod_received flag to trips ───────────────────────────────
--
-- Gap: Trips can be marked "completed" without uploading POD.
-- Fix: Add pod_received_at timestamp. Trip status gate checks this before
-- allowing final completion.
-- Note: Soft gate (warning not hard block) to avoid locking out edge cases.

ALTER TABLE public.trips
  ADD COLUMN IF NOT EXISTS pod_received_at  timestamptz,
  ADD COLUMN IF NOT EXISTS pod_required      boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.trips.pod_received_at IS
  'When POD was uploaded and confirmed. Null = POD not yet received.
   Used as a soft gate before invoicing: invoice generation warns if pod_received_at is null.';

COMMENT ON COLUMN public.trips.pod_required IS
  'Whether this trip type requires POD before invoicing. Default true. Can be set false for
   advance-payment or contract trips where POD is waived.';

CREATE INDEX IF NOT EXISTS idx_trips_pod_pending
  ON public.trips(organization_id, pod_received_at)
  WHERE pod_received_at IS NULL
    AND status IN ('completed', 'delivered', 'done');

-- ── 6. Backfill pod_received_at for already-completed trips with POD documents

UPDATE public.trips t
SET pod_received_at = (
  SELECT min(td.uploaded_at)
  FROM public.trip_documents td
  WHERE td.trip_id = t.id
    AND td.document_type = 'pod'
)
WHERE t.status IN ('completed', 'delivered', 'done')
  AND t.pod_received_at IS NULL
  AND EXISTS (
    SELECT 1 FROM public.trip_documents td
    WHERE td.trip_id = t.id AND td.document_type = 'pod'
  );

-- ── 7. RPC: get_audit_log_for_org ─────────────────────────────────────────────
--
-- Gap: workspace_audit_log exists but no UI reads from it.
-- This RPC formats it for display with enriched actor names.

CREATE OR REPLACE FUNCTION public.get_audit_log_for_org(
  p_org_id  uuid,
  p_limit   int  DEFAULT 100,
  p_offset  int  DEFAULT 0
)
RETURNS TABLE (
  id          uuid,
  event_type  text,
  actor_name  text,
  actor_email text,
  payload     jsonb,
  created_at  timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    al.id,
    al.event_type,
    coalesce(p.full_name, au.email, 'System')  AS actor_name,
    au.email                                    AS actor_email,
    al.payload,
    al.created_at
  FROM public.workspace_audit_log al
  LEFT JOIN auth.users au ON au.id = al.actor_id
  LEFT JOIN public.profiles p ON p.id = al.actor_id
  WHERE al.org_id = p_org_id
    AND al.org_id IN (
      SELECT om.organization_id FROM public.organization_members om
      WHERE om.user_id = auth.uid() AND om.role IN ('owner', 'admin')
    )
  ORDER BY al.created_at DESC
  LIMIT p_limit OFFSET p_offset;
$$;

GRANT EXECUTE ON FUNCTION public.get_audit_log_for_org(uuid, int, int) TO authenticated;
