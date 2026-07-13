-- =============================================================================
-- Fix auth_rls_initplan performance advisor: wrap bare auth.uid()/auth.role()
-- calls in RLS policies with (select ...) so Postgres evaluates them once per
-- statement (via InitPlan) instead of once per row. Purely mechanical rewrite
-- generated from each policy's live pg_policies definition — every USING/WITH
-- CHECK clause below is logically identical to the current one, only the
-- auth.*() call sites are wrapped. No policy's access logic changes.
-- =============================================================================

ALTER POLICY "org_members_select_bank_accounts" ON public."entity_bank_accounts"
  USING (organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE ((organization_members.user_id = (select auth.uid())) AND (organization_members.status = 'active'::text))));

ALTER POLICY "org_members_insert_bank_accounts" ON public."entity_bank_accounts"
  WITH CHECK (organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE ((organization_members.user_id = (select auth.uid())) AND (organization_members.status = 'active'::text))));

ALTER POLICY "org_members_update_bank_accounts" ON public."entity_bank_accounts"
  USING (organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE ((organization_members.user_id = (select auth.uid())) AND (organization_members.status = 'active'::text))));

ALTER POLICY "org_members_delete_bank_accounts" ON public."entity_bank_accounts"
  USING (organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE ((organization_members.user_id = (select auth.uid())) AND (organization_members.status = 'active'::text))));

ALTER POLICY "app_config_service_role" ON public."app_config"
  USING ((select auth.role()) = 'service_role'::text);

ALTER POLICY "booking_ref_backfill_log_service" ON public."booking_ref_backfill_log"
  USING ((select auth.role()) = 'service_role'::text);

ALTER POLICY "owner_reads_own_audit" ON public."verification_audit_logs"
  USING (org_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE ((organization_members.user_id = (select auth.uid())) AND (organization_members.status = 'active'::text))));

ALTER POLICY "Allow users to view their own organization's verification jobs" ON public."verification_jobs"
  USING (organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE ((organization_members.user_id = (select auth.uid())) AND (organization_members.status = 'active'::text))));

ALTER POLICY "loads_access_scoped" ON public."loads"
  USING ((owner_user_id = (select auth.uid())) OR (created_by_user_id = (select auth.uid())) OR (EXISTS ( SELECT 1
   FROM (trips t
     JOIN organization_members om ON (((om.organization_id = t.organization_id) AND (om.user_id = (select auth.uid())) AND (om.status = 'active'::text))))
  WHERE (t.id = loads.trip_id))) OR (EXISTS ( SELECT 1
   FROM (indents i
     JOIN organization_members om ON (((om.organization_id = i.organization_id) AND (om.user_id = (select auth.uid())) AND (om.status = 'active'::text))))
  WHERE (i.id = loads.indent_id))))
  WITH CHECK ((owner_user_id = (select auth.uid())) OR (created_by_user_id = (select auth.uid())) OR (EXISTS ( SELECT 1
   FROM (trips t
     JOIN organization_members om ON (((om.organization_id = t.organization_id) AND (om.user_id = (select auth.uid())) AND (om.status = 'active'::text))))
  WHERE (t.id = loads.trip_id))) OR (EXISTS ( SELECT 1
   FROM (indents i
     JOIN organization_members om ON (((om.organization_id = i.organization_id) AND (om.user_id = (select auth.uid())) AND (om.status = 'active'::text))))
  WHERE (i.id = loads.indent_id))));

ALTER POLICY "Linked supplier inserts supplier in driver thread" ON public."trip_messages"
  WITH CHECK ((sender_role = 'supplier'::text) AND (organization_id = ( SELECT tc.organization_id
   FROM trip_conversations tc
  WHERE (tc.id = trip_messages.conversation_id))) AND ((EXISTS ( SELECT 1
   FROM (((trip_conversations tc
     JOIN trips t ON ((t.id = tc.trip_id)))
     JOIN suppliers s ON ((s.id = t.supplier_id)))
     JOIN organization_members om ON (((om.user_id = (select auth.uid())) AND (om.organization_id = s.linked_organization_id) AND (om.status = 'active'::text))))
  WHERE ((tc.id = trip_messages.conversation_id) AND (tc.party_type = 'driver'::text)))) OR (EXISTS ( SELECT 1
   FROM ((((trip_conversations tc
     JOIN trips t ON ((t.id = tc.trip_id)))
     JOIN indents i ON ((i.id = t.indent_id)))
     JOIN direct_quotes dq ON (((dq.indent_id = i.id) AND (dq.status = 'accepted'::text))))
     JOIN organization_members om ON (((om.organization_id = dq.bidder_organization_id) AND (om.user_id = (select auth.uid())) AND (om.status = 'active'::text))))
  WHERE ((tc.id = trip_messages.conversation_id) AND (tc.party_type = 'driver'::text) AND (t.supplier_id IS NULL) AND (t.indent_id IS NOT NULL))))));

ALTER POLICY "Orgs can read trips where they are the supplier" ON public."trips"
  USING ((indent_id IS NOT NULL) AND ((EXISTS ( SELECT 1
   FROM suppliers s
  WHERE ((s.id = trips.supplier_id) AND (s.linked_organization_id IS NOT NULL) AND (s.linked_organization_id IN ( SELECT om.organization_id
           FROM organization_members om
          WHERE ((om.user_id = (select auth.uid())) AND (COALESCE(om.status, 'active'::text) = 'active'::text))))))) OR (EXISTS ( SELECT 1
   FROM direct_quotes dq
  WHERE ((dq.indent_id = trips.indent_id) AND (lower(TRIM(BOTH FROM COALESCE(dq.status, ''::text))) = 'accepted'::text) AND (dq.bidder_organization_id IN ( SELECT om.organization_id
           FROM organization_members om
          WHERE ((om.user_id = (select auth.uid())) AND (COALESCE(om.status, 'active'::text) = 'active'::text)))))))));

ALTER POLICY "Linked supplier org inserts supplier party messages" ON public."trip_messages"
  WITH CHECK ((sender_role = 'supplier'::text) AND (organization_id = ( SELECT tc.organization_id
   FROM trip_conversations tc
  WHERE (tc.id = trip_messages.conversation_id))) AND ((EXISTS ( SELECT 1
   FROM (((trip_conversations tc
     JOIN trips t ON ((t.id = tc.trip_id)))
     JOIN suppliers s ON (((s.id = t.supplier_id) AND (s.id = tc.supplier_id))))
     JOIN organization_members om ON (((om.user_id = (select auth.uid())) AND (om.organization_id = s.linked_organization_id) AND (COALESCE(om.status, 'active'::text) = 'active'::text))))
  WHERE ((tc.id = trip_messages.conversation_id) AND (tc.party_type = 'supplier'::text)))) OR (EXISTS ( SELECT 1
   FROM (((trip_conversations tc
     JOIN trips t ON ((t.id = tc.trip_id)))
     JOIN direct_quotes dq ON (((dq.indent_id = t.indent_id) AND (lower(TRIM(BOTH FROM COALESCE(dq.status, ''::text))) = 'accepted'::text))))
     JOIN organization_members om ON (((om.user_id = (select auth.uid())) AND (om.organization_id = dq.bidder_organization_id) AND (COALESCE(om.status, 'active'::text) = 'active'::text))))
  WHERE ((tc.id = trip_messages.conversation_id) AND (tc.party_type = 'supplier'::text) AND (t.indent_id IS NOT NULL) AND (tc.supplier_id IS NOT NULL) AND (EXISTS ( SELECT 1
           FROM suppliers s2
          WHERE ((s2.id = tc.supplier_id) AND (s2.linked_organization_id = dq.bidder_organization_id)))))))));

ALTER POLICY "ratings_select_when_rated_driver_is_self" ON public."ratings"
  USING ((rated_type = 'driver'::text) AND (EXISTS ( SELECT 1
   FROM drivers d
  WHERE ((d.id = ratings.rated_id) AND (d.user_id = (select auth.uid()))))));

ALTER POLICY "Drivers read own locations" ON public."driver_locations"
  USING (driver_id IN ( SELECT drivers.id
   FROM drivers
  WHERE (drivers.user_id = (select auth.uid()))));

ALTER POLICY "Linked supplier dispatcher inserts in host trip convs" ON public."trip_messages"
  WITH CHECK ((sender_role = 'dispatcher'::text) AND (organization_id = ( SELECT tc.organization_id
   FROM trip_conversations tc
  WHERE (tc.id = trip_messages.conversation_id))) AND ((EXISTS ( SELECT 1
   FROM (((trip_conversations tc
     JOIN trips t ON ((t.id = tc.trip_id)))
     JOIN suppliers s ON (((s.id = t.supplier_id) AND (s.id = tc.supplier_id))))
     JOIN organization_members om ON (((om.user_id = (select auth.uid())) AND (om.organization_id = s.linked_organization_id) AND (om.status = 'active'::text))))
  WHERE ((tc.id = trip_messages.conversation_id) AND (tc.party_type = 'supplier'::text)))) OR (EXISTS ( SELECT 1
   FROM (((trip_conversations tc
     JOIN trips t ON ((t.id = tc.trip_id)))
     JOIN suppliers s ON ((s.id = t.supplier_id)))
     JOIN organization_members om ON (((om.user_id = (select auth.uid())) AND (om.organization_id = s.linked_organization_id) AND (om.status = 'active'::text))))
  WHERE ((tc.id = trip_messages.conversation_id) AND (tc.party_type = 'driver'::text))))));

ALTER POLICY "To-org can read connection_requests to them" ON public."connection_requests"
  USING ((EXISTS ( SELECT 1
   FROM organization_members om
  WHERE ((om.organization_id = connection_requests.to_organization_id) AND (om.user_id = (select auth.uid()))))) OR (EXISTS ( SELECT 1
   FROM organizations o
  WHERE ((o.id = connection_requests.to_organization_id) AND (o.owner_id = (select auth.uid()))))));

ALTER POLICY "To-org can update connection_requests to them" ON public."connection_requests"
  USING ((EXISTS ( SELECT 1
   FROM organization_members om
  WHERE ((om.organization_id = connection_requests.to_organization_id) AND (om.user_id = (select auth.uid()))))) OR (EXISTS ( SELECT 1
   FROM organizations o
  WHERE ((o.id = connection_requests.to_organization_id) AND (o.owner_id = (select auth.uid()))))));

ALTER POLICY "org_members_read_branding" ON public."branding_settings"
  USING (org_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = (select auth.uid()))));

ALTER POLICY "org_admins_write_branding" ON public."branding_settings"
  USING (org_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE ((organization_members.user_id = (select auth.uid())) AND (organization_members.role = ANY (ARRAY['owner'::text, 'admin'::text])))))
  WITH CHECK (org_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE ((organization_members.user_id = (select auth.uid())) AND (organization_members.role = ANY (ARRAY['owner'::text, 'admin'::text])))));

ALTER POLICY "audit_log_admins_insert" ON public."workspace_audit_log"
  WITH CHECK (org_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE ((organization_members.user_id = (select auth.uid())) AND (organization_members.role = ANY (ARRAY['owner'::text, 'admin'::text])))));

ALTER POLICY "audit_log_admins_select" ON public."workspace_audit_log"
  USING (org_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE ((organization_members.user_id = (select auth.uid())) AND (organization_members.role = ANY (ARRAY['owner'::text, 'admin'::text])))));

ALTER POLICY "trip_workflow_org_read" ON public."trip_workflow_events"
  USING (org_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = (select auth.uid()))));

ALTER POLICY "trip_workflow_org_insert" ON public."trip_workflow_events"
  WITH CHECK (org_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = (select auth.uid()))));

ALTER POLICY "org_members_read_client_risk" ON public."client_risk_scores"
  USING (organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = (select auth.uid()))));

ALTER POLICY "org_members_read_trip_predictions" ON public."trip_predictions"
  USING (organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = (select auth.uid()))));

ALTER POLICY "org_members_read_vehicle_health" ON public."vehicle_health_scores"
  USING (organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = (select auth.uid()))));

ALTER POLICY "org_members_read_ai_settings" ON public."ai_settings"
  USING (organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = (select auth.uid()))));

ALTER POLICY "org_admins_write_ai_settings" ON public."ai_settings"
  USING (organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE ((organization_members.user_id = (select auth.uid())) AND (organization_members.role = ANY (ARRAY['owner'::text, 'admin'::text])))))
  WITH CHECK (organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE ((organization_members.user_id = (select auth.uid())) AND (organization_members.role = ANY (ARRAY['owner'::text, 'admin'::text])))));

ALTER POLICY "Drivers upsert own presence" ON public."driver_presence"
  USING (driver_id IN ( SELECT drivers.id
   FROM drivers
  WHERE (drivers.user_id = (select auth.uid()))))
  WITH CHECK (driver_id IN ( SELECT drivers.id
   FROM drivers
  WHERE (drivers.user_id = (select auth.uid()))));

ALTER POLICY "Org members read driver presence" ON public."driver_presence"
  USING (organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = (select auth.uid()))));

ALTER POLICY "Drivers insert checkpoints" ON public."trip_location_checkpoints"
  WITH CHECK (driver_id IN ( SELECT drivers.id
   FROM drivers
  WHERE (drivers.user_id = (select auth.uid()))));

ALTER POLICY "Drivers manage own sessions" ON public."trip_tracking_sessions"
  USING (driver_id IN ( SELECT drivers.id
   FROM drivers
  WHERE (drivers.user_id = (select auth.uid()))))
  WITH CHECK (driver_id IN ( SELECT drivers.id
   FROM drivers
  WHERE (drivers.user_id = (select auth.uid()))));

ALTER POLICY "Org read tracking sessions" ON public."trip_tracking_sessions"
  USING (organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = (select auth.uid()))));

ALTER POLICY "Org read geofence events" ON public."geofence_events"
  USING (organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = (select auth.uid()))));

ALTER POLICY "Drivers insert geofence events" ON public."geofence_events"
  WITH CHECK (driver_id IN ( SELECT drivers.id
   FROM drivers
  WHERE (drivers.user_id = (select auth.uid()))));

ALTER POLICY "org_members_manage_resolutions" ON public."counterparty_resolutions"
  USING (EXISTS ( SELECT 1
   FROM organization_members
  WHERE ((organization_members.organization_id = counterparty_resolutions.org_id) AND (organization_members.user_id = (select auth.uid())))))
  WITH CHECK (EXISTS ( SELECT 1
   FROM organization_members
  WHERE ((organization_members.organization_id = counterparty_resolutions.org_id) AND (organization_members.user_id = (select auth.uid())))));

ALTER POLICY "org_members_view_driver_tenures" ON public."driver_tenures"
  USING (organization_id IN ( SELECT om.organization_id
   FROM organization_members om
  WHERE (om.user_id = (select auth.uid()))));

ALTER POLICY "org_members_view_shared_ledger_connections" ON public."shared_ledger_connection"
  USING ((org_a_id IN ( SELECT om.organization_id
   FROM organization_members om
  WHERE (om.user_id = (select auth.uid())))) OR (org_b_id IN ( SELECT om.organization_id
   FROM organization_members om
  WHERE (om.user_id = (select auth.uid())))));

ALTER POLICY "org_admins_manage_shared_ledger_connections" ON public."shared_ledger_connection"
  USING ((org_a_id IN ( SELECT om.organization_id
   FROM organization_members om
  WHERE ((om.user_id = (select auth.uid())) AND (om.role = ANY (ARRAY['owner'::text, 'admin'::text]))))) OR (org_b_id IN ( SELECT om.organization_id
   FROM organization_members om
  WHERE ((om.user_id = (select auth.uid())) AND (om.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));

ALTER POLICY "service_role_only_id_log" ON public."id_generation_log"
  USING ((select auth.role()) = 'service_role'::text);

ALTER POLICY "authenticated_read_global_refs" ON public."global_references"
  USING ((select auth.role()) = 'authenticated'::text);

ALTER POLICY "org_members_read_network_identities" ON public."network_identities"
  USING (participant_orgs && ARRAY( SELECT om.organization_id
   FROM organization_members om
  WHERE (om.user_id = (select auth.uid()))));

ALTER POLICY "org_members_read_anchors" ON public."entity_identity_anchors"
  USING (org_id IN ( SELECT om.organization_id
   FROM organization_members om
  WHERE (om.user_id = (select auth.uid()))));

ALTER POLICY "org_members_manage_own_idempotency_keys" ON public."idempotency_keys"
  USING (org_id IN ( SELECT om.organization_id
   FROM organization_members om
  WHERE (om.user_id = (select auth.uid()))));

ALTER POLICY "org_members_read_events" ON public."event_store"
  USING ((org_id IS NULL) OR (org_id IN ( SELECT om.organization_id
   FROM organization_members om
  WHERE (om.user_id = (select auth.uid())))));

ALTER POLICY "service_role_manages_outbox" ON public."event_outbox"
  USING ((select auth.role()) = 'service_role'::text);

ALTER POLICY "service_role_manages_dlq" ON public."event_dead_letter"
  USING ((select auth.role()) = 'service_role'::text);

ALTER POLICY "org_members_search" ON public."search_index"
  USING ((org_id IS NULL) OR (org_id IN ( SELECT om.organization_id
   FROM organization_members om
  WHERE (om.user_id = (select auth.uid())))));

ALTER POLICY "org_members_read_feed" ON public."activity_stream"
  USING (is_public OR (org_id IN ( SELECT om.organization_id
   FROM organization_members om
  WHERE (om.user_id = (select auth.uid())))) OR (actor_id = (select auth.uid())));

ALTER POLICY "org_members_manage_invoice_seq" ON public."invoice_sequences"
  USING (org_id IN ( SELECT om.organization_id
   FROM organization_members om
  WHERE (om.user_id = (select auth.uid()))));

ALTER POLICY "org_members_manage_invoices" ON public."invoices"
  USING (org_id IN ( SELECT om.organization_id
   FROM organization_members om
  WHERE (om.user_id = (select auth.uid()))));

ALTER POLICY "org_members_manage_supplier_bills" ON public."supplier_bills"
  USING (org_id IN ( SELECT om.organization_id
   FROM organization_members om
  WHERE (om.user_id = (select auth.uid()))));

ALTER POLICY "org_members_view_products" ON public."workspace_products"
  USING (org_id IN ( SELECT om.organization_id
   FROM organization_members om
  WHERE (om.user_id = (select auth.uid()))));

ALTER POLICY "org_admins_manage_products" ON public."workspace_products"
  USING (org_id IN ( SELECT om.organization_id
   FROM organization_members om
  WHERE ((om.user_id = (select auth.uid())) AND (om.role = ANY (ARRAY['owner'::text, 'admin'::text])))));

ALTER POLICY "users_manage_own_waitlist" ON public."product_waitlist"
  USING ((user_id = (select auth.uid())) OR (org_id IN ( SELECT om.organization_id
   FROM organization_members om
  WHERE (om.user_id = (select auth.uid())))));

ALTER POLICY "org_members_view_usage" ON public."product_usage"
  USING (org_id IN ( SELECT om.organization_id
   FROM organization_members om
  WHERE (om.user_id = (select auth.uid()))));

-- reporting schema — missed by the public-schema-only advisor sweep above,
-- caught on verification re-run.
ALTER POLICY "org_members_read_cashflow" ON reporting."cashflow_forecast"
  USING (organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = (select auth.uid()))));
