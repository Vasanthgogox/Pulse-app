-- SECURITY: Restore authenticated-only EXECUTE on get_network_feed.
--
-- Root cause: repeated DROP FUNCTION → CREATE FUNCTION migrations recreate the
-- SECURITY DEFINER function with Postgres default PUBLIC EXECUTE. That wiped
-- the earlier authenticated-only grant from 20260728210000_v2_audit_anon_rpc_revoke.
-- FO capacity made the exposure worse (identifiable owner capacity in the feed)
-- but did not invent the grant regression.
--
-- Scope: EXECUTE privileges only. Do NOT change FO visibility / RLS / feed body.
-- Signature must match live: get_network_feed(uuid, integer, integer).
--
-- After any future DROP/CREATE of this function, re-run the REVOKE/GRANT below.

REVOKE ALL ON FUNCTION public.get_network_feed(uuid, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_network_feed(uuid, integer, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_network_feed(uuid, integer, integer) TO authenticated;

COMMENT ON FUNCTION public.get_network_feed(uuid, integer, integer) IS
  'Org Network feed (organic + Reach snapshot branches). EXECUTE: authenticated only — never PUBLIC/anon. Re-apply REVOKE/GRANT after any DROP/CREATE.';
