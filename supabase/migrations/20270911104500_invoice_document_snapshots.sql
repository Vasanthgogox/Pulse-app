-- Phase 2A-1: durable invoice document snapshots (additive, nullable).
-- Existing invoices remain valid with NULL snapshot columns. No backfill.
-- Does not change allocate_invoice_number(), status, or existing columns.

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS issuer_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS client_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS line_items jsonb,
  ADD COLUMN IF NOT EXISTS tax_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS payment_terms text;

COMMENT ON COLUMN public.invoices.issuer_snapshot IS
  'Issued-at legal issuer snapshot (jsonb). Shape: legal_name, address_line, locality, city, state, pincode, business_pan, gstin, gst_not_applicable, logo_url, org_id. Source: active workspace. NULL on historical rows.';

COMMENT ON COLUMN public.invoices.client_snapshot IS
  'Issued-at client legal snapshot (jsonb). Shape: client_id, legal_name, gstin, pan, billing_address, state, email. NULL on historical rows.';

COMMENT ON COLUMN public.invoices.line_items IS
  'Issued-at billed lines (jsonb array). Each item: trip_id, trip_ref, description, qty, unit, rate, taxable_value, line_type (freight|fuel|additional), hsn_sac, tax_rate. NULL on historical rows.';

COMMENT ON COLUMN public.invoices.tax_snapshot IS
  'Issued-at tax metadata (jsonb). Shape: supply_type, place_of_supply, hsn_sac, determination. Amounts remain gst_rate/cgst_amount/sgst_amount/igst_amount. NULL on historical rows.';

COMMENT ON COLUMN public.invoices.payment_terms IS
  'Issued-at payment terms label (e.g. Net 30). due_date remains the authoritative due date. NULL on historical rows.';
