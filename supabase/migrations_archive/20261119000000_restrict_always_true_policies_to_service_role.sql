-- =============================================================================
-- Fix rls_policy_always_true advisor + a real security gap: 5 policies named
-- for service-role-only access ("service role full access", "*_write_all",
-- "system_inserts_events") were actually granted to {public} with
-- USING/WITH CHECK (true) — combined with default anon+authenticated table
-- grants, this let ANY client (including unauthenticated) insert/update/
-- delete rows in these tables directly via PostgREST. Restricting the role
-- to service_role matches the policy names' original intent; the admin
-- console (analytics/) already uses the service role key so its
-- org_feature_flags writes are unaffected (service_role bypasses RLS).
--
-- NOTE: app/audit/index.tsx (an unauthenticated internal QA checklist tool)
-- reads/writes pulse_audit_actions/pulse_audit_verifications using the anon
-- key and will break until that route gets a proper auth guard — tracked as
-- a known follow-up, not fixed here.
-- =============================================================================

ALTER POLICY "system_inserts_events" ON public.event_store TO service_role;
ALTER POLICY "service role full access" ON public.org_feature_flags TO service_role;
ALTER POLICY "pulse_audit_actions_write_all" ON public.pulse_audit_actions TO service_role;
ALTER POLICY "pulse_audit_ver_write_all" ON public.pulse_audit_verifications TO service_role;
ALTER POLICY "trip_status_audit_system_insert" ON public.trip_status_audit TO service_role;
