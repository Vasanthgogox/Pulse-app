-- =============================================================================
-- V2 Audit Fix 2: Revoke anon EXECUTE on all SECURITY DEFINER RPCs (SEC-1 complete)
-- Only organization_name_is_taken + get_driver_invitee_by_phone kept for anon (signup/invite)
-- =============================================================================

-- Revoke from PUBLIC (anon inherits EXECUTE from PUBLIC by default in pg)
-- Trigger functions are exempt from EXECUTE checks when fired by triggers, so this is safe.
DO $$
DECLARE
  r RECORD;
  sig TEXT;
BEGIN
  FOR r IN
    SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
  LOOP
    sig := format('%I(%s)', r.proname, r.args);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM PUBLIC', sig);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM anon', sig);
  END LOOP;
END $$;

-- Restore authenticated access
GRANT EXECUTE ON FUNCTION public.accept_bid(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_driver_invite(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_driver_ledger_entry(uuid,uuid,text,numeric,text,uuid,uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assign_aggregate_trip_driver(uuid,uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(uuid,text,integer,interval) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_trip_from_direct_quote(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dismiss_driver_signup_match(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.driver_update_trip_status(uuid,text,timestamptz,timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_driver_signup_matches(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_ensure_trip_party_conversations(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_post_system_message_to_trip_chats(uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_post_trip_feedback_prompt_to_chats(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_storage_trip_doc_access(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_client_detail_bundle(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_client_details(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_clients_with_profiles(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_connection_partner_display(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_connection_partner_display_batch(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_connection_requests_received_with_names(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_connection_requests_sent_with_names(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_db_capabilities() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_direct_quotes_with_bidder_names(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_driver_balance(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_driver_coalesced_email_for_org(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_driver_detail_bundle(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_driver_invite_sent_status(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_driver_invitee_by_phone(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_driver_invites_received() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_driver_invites_sent(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_driver_latest_location(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_driver_location_history_for_trip(uuid,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_driver_profile_display(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_driver_profile_display_batch(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_driver_signup_match_status(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_drivers_with_profiles(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_integrated_partners(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_last_n_locations_for_trip(uuid,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_latest_driver_location_for_trip(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_network_feed(uuid,integer,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_org_ledger_summary(uuid,date,date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_org_trip_metrics(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_pending_otp_claim_count() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_pending_otp_trips() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_pod_reconciliation_summary(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_shared_trip_finance_adjustments(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_shipper_display_names_for_supplier_trips(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_supplier_details(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_supplier_trip_ids_for_org(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_suppliers_with_profiles(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_trip_assigner_displays_for_driver(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_trip_status_summary(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_trips_for_org(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_trips_for_pod_org(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_trips_where_org_is_client(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_trips_where_org_is_supplier(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_org_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.leave_fleet(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.link_driver_phone(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_conversation_read(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_delivered(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_messages_seen(uuid,uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_network_conversation_read(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.match_driver_by_phone(uuid,text,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_organization_ids() TO authenticated;
GRANT EXECUTE ON FUNCTION public.next_indent_number(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.next_trip_number(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_driver_invite(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reset_driver_signup_invite(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_dispute(uuid,uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.send_driver_signup_match_invite(uuid,numeric,numeric,numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.send_driver_signup_match_invite(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.send_trip_chat_message(uuid,text,text,text,uuid,text,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.soft_delete_trip(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_trip_feedback(uuid,uuid,uuid,text,uuid,integer,text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.windowed_trip_message_history(uuid,timestamptz,integer,text) TO authenticated;

-- Signup/invite flows only (anon-accessible)
GRANT EXECUTE ON FUNCTION public.organization_name_is_taken(text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_driver_invitee_by_phone(text) TO anon;
