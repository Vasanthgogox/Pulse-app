-- DCO-4 correction, caught during post-apply verification of
-- 20270310210000: is_dco_eligible() and get_dco_payee_id() had EXECUTE
-- revoked from PUBLIC and authenticated (per the reviewed fix for their
-- over-exposure as internal SECURITY DEFINER predicates), but not from
-- anon. Supabase's default privileges on the public schema separately
-- grant anon (and service_role) EXECUTE on every newly created function
-- unless explicitly revoked -- REVOKE ... FROM PUBLIC does not touch that
-- separate grant. Confirmed live via has_function_privilege('anon', ...) =
-- true immediately after the prior migration applied.
--
-- Practical exposure: both functions take an arbitrary p_user_id (not
-- necessarily auth.uid()), so this meant literally unauthenticated traffic
-- could ask whether an arbitrary person is an approved/currently-eligible
-- DCO, or fetch their dco_payees.id, via PostgREST's default RPC exposure
-- for any function in the public schema. service_role keeps EXECUTE
-- (unchanged) -- it is the trusted backend credential, not exposed to
-- end users, and several existing marketplace RPCs already treat
-- current_user='service_role' as a trust anchor.

REVOKE ALL ON FUNCTION public.is_dco_eligible(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.get_dco_payee_id(uuid) FROM anon;
