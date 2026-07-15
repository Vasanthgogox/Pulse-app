-- =============================================================================
-- V2 Audit Fix 7: Remaining unindexed FK indexes + zero-policy table comments
-- PERF-3 (final): 9 remaining FK columns across audit/reference tables
-- NEW-SEC-2: Document deny-all intent for driver_trip_counters + ops_agent_rate_log
-- =============================================================================

-- Remaining unindexed FKs (all tables — complete)
CREATE INDEX IF NOT EXISTS idx_accounting_books_trip_id               ON public.accounting_books (trip_id);
CREATE INDEX IF NOT EXISTS idx_client_contracts_warehouse_id          ON public.client_contracts (warehouse_id);
CREATE INDEX IF NOT EXISTS idx_shared_ledger_notif_partner_org_id     ON public.shared_ledger_notifications (partner_org_id);
CREATE INDEX IF NOT EXISTS idx_shared_ledger_notif_source_dispute_id  ON public.shared_ledger_notifications (source_dispute_id);
CREATE INDEX IF NOT EXISTS idx_trip_assignment_audit_changed_by       ON public.trip_assignment_audit (changed_by);
CREATE INDEX IF NOT EXISTS idx_trip_assignment_audit_driver_id_new    ON public.trip_assignment_audit (driver_id_new);
CREATE INDEX IF NOT EXISTS idx_trip_assignment_audit_driver_id_prev   ON public.trip_assignment_audit (driver_id_prev);
CREATE INDEX IF NOT EXISTS idx_trip_assignment_audit_vehicle_id_new   ON public.trip_assignment_audit (vehicle_id_new);
CREATE INDEX IF NOT EXISTS idx_trip_assignment_audit_vehicle_id_prev  ON public.trip_assignment_audit (vehicle_id_prev);

-- Document RLS deny-all intent (NEW-SEC-2)
COMMENT ON TABLE public.driver_trip_counters IS 'Internal counter table. Written only via SECURITY DEFINER RPCs. RLS deny-all is intentional — no direct client access.';
COMMENT ON TABLE public.ops_agent_rate_log   IS 'Internal ops-agent rate log. Written only via SECURITY DEFINER RPCs. RLS deny-all is intentional — no direct client access.';
