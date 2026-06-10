-- Party profile reference fields — align client/supplier hubs with dispatcher-portal-pro Add Client wizard
-- and supplier onboarding agreement tracking.

-- ─── Client CRM / KAM / financial snapshot ────────────────────────────────────
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS tan_number text,
  ADD COLUMN IF NOT EXISTS kam_name text,
  ADD COLUMN IF NOT EXISTS kam_email text,
  ADD COLUMN IF NOT EXISTS kam_phone text,
  ADD COLUMN IF NOT EXISTS billing_contact_name text,
  ADD COLUMN IF NOT EXISTS billing_contact_email text,
  ADD COLUMN IF NOT EXISTS billing_contact_phone text,
  ADD COLUMN IF NOT EXISTS potential_volume numeric(16,2),
  ADD COLUMN IF NOT EXISTS projected_contract_revenue numeric(16,2),
  ADD COLUMN IF NOT EXISTS payment_terms_label text,
  ADD COLUMN IF NOT EXISTS invoice_frequency_label text;

-- ─── Client warehouse zone (reference: warehouseZone) ─────────────────────────
ALTER TABLE public.client_warehouses
  ADD COLUMN IF NOT EXISTS warehouse_zone text;

-- ─── Client lane rates — contract lane reference fields ───────────────────────
ALTER TABLE public.client_lane_rates
  ADD COLUMN IF NOT EXISTS destination_gstin text,
  ADD COLUMN IF NOT EXISTS destination_address text,
  ADD COLUMN IF NOT EXISTS warehouse_zone text,
  ADD COLUMN IF NOT EXISTS distance_km numeric(10,2),
  ADD COLUMN IF NOT EXISTS pricing_model text,
  ADD COLUMN IF NOT EXISTS base_rate numeric(14,2),
  ADD COLUMN IF NOT EXISTS per_mt_rate numeric(14,2),
  ADD COLUMN IF NOT EXISTS per_km_rate numeric(14,2);

-- ─── Supplier onboarding agreement ────────────────────────────────────────────
ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS onboarding_agreement_status text DEFAULT 'pending'
    CHECK (onboarding_agreement_status IN ('pending', 'draft', 'signed', 'expired', 'terminated')),
  ADD COLUMN IF NOT EXISTS onboarding_agreement_signed_at timestamptz,
  ADD COLUMN IF NOT EXISTS onboarding_agreement_storage_path text,
  ADD COLUMN IF NOT EXISTS onboarding_agreement_notes text;
