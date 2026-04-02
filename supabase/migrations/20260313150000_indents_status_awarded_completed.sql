-- Allow indent status 'awarded' and 'completed' for Load Hub award and trip-completion flows.
-- Fixes: "new row for relation indents violates check constraint indents_status_check"
-- when awarding a quote or marking indent completed after trip creation.

ALTER TABLE public.indents DROP CONSTRAINT IF EXISTS indents_status_check;

ALTER TABLE public.indents ADD CONSTRAINT indents_status_check
  CHECK (status IN ('open', 'closed', 'cancelled', 'awarded', 'completed'));

COMMENT ON COLUMN public.indents.status IS 'open=accepting quotes; awarded=winner chosen; completed=trip done; closed/cancelled=terminal.';
