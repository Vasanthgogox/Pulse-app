-- pulse_audit_actions gained sub_seq (order multiple steps sharing the same
-- seq), flow_group, and is_subflow columns. Backfills them so later
-- migrations (e.g. 20261025000000) that insert using these columns can run.
ALTER TABLE public.pulse_audit_actions
  ADD COLUMN IF NOT EXISTS sub_seq integer,
  ADD COLUMN IF NOT EXISTS flow_group text,
  ADD COLUMN IF NOT EXISTS is_subflow boolean NOT NULL DEFAULT false;
