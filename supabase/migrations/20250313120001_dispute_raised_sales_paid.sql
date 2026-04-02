-- Add raiser's sales/paid to dispute so Accept & Auto-Update can call accept_partner_view and update receiver's ledger.
-- When receiver resolves with ACCEPT, the app uses these to update their ledger to match the raiser's view.

ALTER TABLE public.dispute
  ADD COLUMN IF NOT EXISTS raised_sales numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS raised_paid numeric DEFAULT 0;

COMMENT ON COLUMN public.dispute.raised_sales IS 'Raiser''s sales for this trip; used when partner accepts to update their ledger.';
COMMENT ON COLUMN public.dispute.raised_paid IS 'Raiser''s paid for this trip; used when partner accepts to update their ledger.';
