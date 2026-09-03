-- Final audit follow-up: platform_approve_verification / platform_reject_verification
-- were still anon-executable. Both already guard internally on
-- verification.approve, so an anon call failed the permission check -- but they
-- should not be reachable by an unauthenticated caller at all. Defence in depth,
-- matching every other admin RPC after 20270306030000.
--
-- Grants only; no function body, table or policy is touched.
REVOKE EXECUTE ON FUNCTION public.platform_approve_verification(uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.platform_approve_verification(uuid, text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.platform_reject_verification(uuid, jsonb, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.platform_reject_verification(uuid, jsonb, text) TO authenticated, service_role;