-- =============================================================================
-- Fix function_search_path_mutable advisor: pin search_path on 29 functions
-- that had none set. Without this, a caller with a permissive session
-- search_path could shadow an unqualified table/function reference inside
-- these functions with one from another schema — a real risk for the 4
-- SECURITY DEFINER functions here (they run with the definer's privileges),
-- and generally recommended hardening for the rest. Reviewed each function
-- body first: all reference only public-schema objects or built-ins, so
-- `public, pg_temp` preserves current behavior exactly.
-- =============================================================================

ALTER FUNCTION public.sqids_shuffle(text) SET search_path = public, pg_temp;
ALTER FUNCTION public.trg_block_operational_code_change() SET search_path = public, pg_temp;
ALTER FUNCTION public.sqids_encode_sub_trip_code(text, bigint) SET search_path = public, pg_temp;
ALTER FUNCTION public.trg_set_transaction_payment_ref() SET search_path = public, pg_temp;
ALTER FUNCTION public.sqids_to_id(bigint, text) SET search_path = public, pg_temp;
ALTER FUNCTION public.suppliers_block_deprecated_fields() SET search_path = public, pg_temp;
ALTER FUNCTION public.clients_warn_legacy_address() SET search_path = public, pg_temp;
ALTER FUNCTION public.entity_bank_accounts_set_updated_at() SET search_path = public, pg_temp;
ALTER FUNCTION public.profiles_block_deprecated_driver_fields() SET search_path = public, pg_temp;
ALTER FUNCTION public.fill_driver_commission() SET search_path = public, pg_temp;
-- check_cron_job_health exists in production but was never captured in a
-- tracked migration, so it's absent on a fresh local DB. Guarded so this
-- migration still applies the fix in production while being a no-op locally.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'check_cron_job_health'
  ) THEN
    ALTER FUNCTION public.check_cron_job_health(integer, integer) SET search_path = public, pg_temp;
  END IF;
END $$;
ALTER FUNCTION public.set_updated_at() SET search_path = public, pg_temp;
ALTER FUNCTION public.discover_extract_city(text) SET search_path = public, pg_temp;
ALTER FUNCTION public.fn_build_chat_lanes(jsonb) SET search_path = public, pg_temp;
ALTER FUNCTION public.log_kyc_change() SET search_path = public, pg_temp;
ALTER FUNCTION public.log_trip_completed() SET search_path = public, pg_temp;
ALTER FUNCTION public.notify_trip_workflow_event() SET search_path = public, pg_temp;
ALTER FUNCTION public.make_operational_org_code(text, uuid, integer) SET search_path = public, pg_temp;
ALTER FUNCTION public.prevent_operational_code_update() SET search_path = public, pg_temp;
ALTER FUNCTION public.operational_prefix_for_entity(text) SET search_path = public, pg_temp;
ALTER FUNCTION public.update_shared_ledger_connection_updated_at() SET search_path = public, pg_temp;
ALTER FUNCTION public.is_valid_business_reference(text) SET search_path = public, pg_temp;
ALTER FUNCTION public.uuidv7_generate() SET search_path = public, pg_temp;
ALTER FUNCTION public.is_uuidv4(uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.is_uuidv7(uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.uuidv7_timestamp(uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.fn_workspace_products_updated_at() SET search_path = public, pg_temp;
ALTER FUNCTION public.clear_tracking_only_on_user_link() SET search_path = public, pg_temp;
ALTER FUNCTION public.set_audit_ver_updated_at() SET search_path = public, pg_temp;
