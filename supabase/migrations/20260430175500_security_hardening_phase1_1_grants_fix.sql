-- Follow-up grant fix: remove accidental PUBLIC/anon execute on rate-limit helper.

BEGIN;

REVOKE EXECUTE ON FUNCTION public.enforce_rpc_rate_limit(text, integer, interval) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enforce_rpc_rate_limit(text, integer, interval) TO authenticated, service_role;

COMMIT;
