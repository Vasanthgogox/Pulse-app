-- Add contact_id and contact_type to transactions so ledger cash-out can be attributed to driver/client/supplier.
-- Drivers tab uses contact_type = 'driver' and contact_id = driver.id to count amount_out as "paid" and reduce "due".

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS contact_id uuid,
  ADD COLUMN IF NOT EXISTS contact_type text;

ALTER TABLE public.transactions
  DROP CONSTRAINT IF EXISTS transactions_contact_type_check;

ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_contact_type_check
  CHECK (contact_type IS NULL OR contact_type IN ('client', 'supplier', 'driver'));

CREATE INDEX IF NOT EXISTS idx_transactions_contact ON public.transactions(contact_type, contact_id)
  WHERE contact_id IS NOT NULL;

COMMENT ON COLUMN public.transactions.contact_id IS 'Party id: client, supplier, or driver id for aggregation in Finance tabs.';
COMMENT ON COLUMN public.transactions.contact_type IS 'Party type: client, supplier, or driver.';
