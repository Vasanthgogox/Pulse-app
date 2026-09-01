-- Support security hardening: close the PUBLIC-EXECUTE gap.
--
-- Root cause (confirmed via has_function_privilege() against the live project):
-- PostgreSQL grants EXECUTE to PUBLIC automatically when a function is created.
-- The original 20270302010000 migration explicitly revoked EXECUTE from `anon`
-- directly, but never revoked it from PUBLIC -- and `anon` inherits everything
-- PUBLIC has, regardless of its own direct grants being revoked. So `anon`
-- still had EXECUTE via the PUBLIC grant despite the explicit anon-specific
-- revoke.
--
-- Precedent (confirmed by reading the actual migration files, not assumed):
-- submit_market_bid/accept_market_bid/reject_market_bid do not have this gap
-- because their own migrations already include `REVOKE ALL ... FROM PUBLIC`
-- (supabase/migrations/20270301040000_market_bids.sql line 164,
-- 20270301060000_accept_reject_market_bid.sql lines 69/227) -- a step this
-- migration's predecessor omitted. This migration brings the two Support RPCs
-- in line with that same, already-established pattern. No Market RPC is
-- touched by this file.
--
-- No change to either function's body, to any table, or to RLS -- EXECUTE
-- grants only.

REVOKE EXECUTE ON FUNCTION public.submit_support_ticket(
  text, text, text, uuid, uuid, uuid, uuid, uuid, text
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.submit_support_ticket(
  text, text, text, uuid, uuid, uuid, uuid, uuid, text
) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.reply_to_support_ticket(uuid, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.reply_to_support_ticket(uuid, text) TO authenticated;
