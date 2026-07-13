-- Idempotent chat "Add to book": at most one local transactions row per org per source ledger row.

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS chat_mirror_of_transaction_id uuid
  REFERENCES public.transactions(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.transactions.chat_mirror_of_transaction_id IS
  'Set when this row was created from chat "Add to book", pointing at the counterparty source transaction id. Unique per organization_id prevents duplicate mirrors.';

CREATE UNIQUE INDEX IF NOT EXISTS ux_transactions_org_chat_mirror_of
  ON public.transactions (organization_id, chat_mirror_of_transaction_id)
  WHERE chat_mirror_of_transaction_id IS NOT NULL;
