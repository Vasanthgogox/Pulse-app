-- Optional structured ledger metadata (Who / Why) alongside contact_id + description.
-- App fills these on insert/update; legacy rows stay NULL and UI derives from interpretLedgerRowStructured().

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS ledger_entity_type text,
  ADD COLUMN IF NOT EXISTS ledger_flow_type text,
  ADD COLUMN IF NOT EXISTS ledger_category text;

ALTER TABLE public.transactions
  DROP CONSTRAINT IF EXISTS transactions_ledger_entity_type_check;

ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_ledger_entity_type_check
  CHECK (
    ledger_entity_type IS NULL
    OR ledger_entity_type IN ('client', 'supplier', 'driver', 'vehicle')
  );

ALTER TABLE public.transactions
  DROP CONSTRAINT IF EXISTS transactions_ledger_flow_type_check;

ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_ledger_flow_type_check
  CHECK (
    ledger_flow_type IS NULL
    OR ledger_flow_type IN ('receivable', 'payable', 'expense')
  );

COMMENT ON COLUMN public.transactions.ledger_entity_type IS 'Logical counterparty pillar: client | supplier | driver | vehicle.';
COMMENT ON COLUMN public.transactions.ledger_flow_type IS 'Cash effect: receivable (IN) | payable | expense (OUT).';
COMMENT ON COLUMN public.transactions.ledger_category IS 'Primary category line (often matches first segment of description).';
