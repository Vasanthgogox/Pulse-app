-- Privilege hardening: DROP + CREATE in 20270304025000 recreated
-- get_driver_reach_stories() as a fresh object, which Postgres grants
-- EXECUTE to PUBLIC on by default. The migration's own explicit GRANT
-- restored the four intended roles (anon, authenticated, service_role,
-- postgres) but never revoked the automatic PUBLIC grant, so the function
-- ended up executable by PUBLIC in addition to the four intended roles --
-- not the exact grant set that was reviewed and approved.
--
-- No reason for a zero-argument application RPC to be callable by every
-- database role. Revoke PUBLIC only; the four intended grants are untouched.

REVOKE EXECUTE
  ON FUNCTION public.get_driver_reach_stories()
  FROM PUBLIC;
