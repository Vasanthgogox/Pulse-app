-- =============================================================
-- Pulse DB Audit v2
--   • Add data_detail column (shows specific fields written per action)
--   • Re-sequence existing rows (+2) to make room for onboarding steps
--   • Insert Sign Up and Create Organization as steps 1 and 2
--   • Populate data_detail for all rows
-- =============================================================

-- 1. Add data_detail column
ALTER TABLE public.pulse_audit_actions
  ADD COLUMN IF NOT EXISTS data_detail text;

-- 2. Shift existing seqs forward by 2
UPDATE public.pulse_audit_actions
  SET seq = seq + 2
  WHERE id IN ('01','02','03','04','05','06','07','08','09','10',
               '11','12','13','14','15','16','17','18','19','20');

-- 3. Insert onboarding steps (signup first, then create org)
INSERT INTO public.pulse_audit_actions
  (id, seq, action, route, service, ins_tables, upd_tables,
   trigger_name, audit_table, priority, verify_sql, data_detail)
VALUES

('S1', 1, 'Sign Up / Register',
 'app/auth/sign-up.tsx', 'auth.service.ts',
 ARRAY['profiles'], ARRAY[]::text[], NULL, NULL, 'HIGH',
 E'SELECT id, email, created_at\nFROM auth.users\nORDER BY created_at DESC\nLIMIT 5;',
 E'auth.users: uid, email, encrypted_password, created_at\nprofiles: id=uid, full_name, role=''user'', phone'),

('S2', 2, 'Create Organization',
 'app/auth/sign-up.tsx', 'auth.service.ts',
 ARRAY['organizations','organization_members'], ARRAY[]::text[], NULL, NULL, 'HIGH',
 E'SELECT o.name, o.operating_model, om.role, om.created_at\nFROM organizations o\nJOIN organization_members om ON om.organization_id = o.id\nORDER BY o.created_at DESC\nLIMIT 3;',
 E'organizations: name, operating_model, type, gstin_optional\norganization_members: user_id, organization_id, role=''owner''')

ON CONFLICT (id) DO NOTHING;

-- 4. Populate data_detail for all existing action rows
UPDATE public.pulse_audit_actions SET data_detail = CASE id
  WHEN '01' THEN E'trips: trip_number, status=''pending'', organization_id, client_id\n  pickup_area, drop_location, client_price, load_type'
  WHEN '02' THEN E'trips: driver_id, driver_display_name (UPDATE)\ntrip_assignment_audit: event_type=''DRIVER_ASSIGNED'', driver_id_new, changed_by'
  WHEN '03' THEN E'trips: vehicle_id, vehicle_display_number (UPDATE)\ntrip_assignment_audit: event_type=''VEHICLE_ASSIGNED'', vehicle_id_new, changed_by'
  WHEN '04' THEN E'trip_otps: trip_id, otp_code, expires_at (INSERT)\ntrips: status→''started'' on verify (UPDATE)'
  WHEN '05' THEN E'trips: status=''started'', started_at (UPDATE)\ntrip_status_audit: status_from=''assigned'', status_to=''started'', changed_by'
  WHEN '06' THEN E'trip_location_checkpoints: trip_id, lat, lng\n  accuracy_meters, speed_kmh, recorded_at'
  WHEN '07' THEN E'trips: status=''completed'', completed_at (UPDATE)\ntrip_workflow_events: event_type=''trip.completed''\n  payload.client_price, payload.completed_at'
  WHEN '08' THEN E'trip_documents: trip_id, file_name, storage_path\n  document_type=''pod'', created_by\ntrips: pod_status (UPDATE)'
  WHEN '09' THEN E'trip_workflow_events: event_type=''invoice.generated''\n  payload.invoice_number, payload.amount, payload.trip_id'
  WHEN '10' THEN E'transactions: party_name, description\n  amount_in / amount_out, transaction_date\n  trip_id, organization_id, contact_id'
  WHEN '11' THEN E'transactions: party_name, amount_out, trip_id\ntrip_workflow_events: event_type=''supplier.paid''\n  payload.amount, payload.supplier_name'
  WHEN '12' THEN E'trips: status=''cancelled'' (UPDATE)\ntrip_status_audit: status_from, status_to=''cancelled'', changed_by'
  WHEN '13' THEN E'indents: origin_location, destination_location\n  load_type, rate_per_ton, status=''open'', organization_id'
  WHEN '14' THEN E'network_bids: indent_id, org_id, rate, status=''pending''\nindents: bid_count+1 (UPDATE)'
  WHEN '15' THEN E'trips: indent_id, status=''pending'' (INSERT)\nindents: status=''awarded'' (UPDATE)\nnetwork_bids: status=''won'' / ''lost'' (UPDATE)'
  WHEN '16' THEN E'organizations: gstin, kyc_status (UPDATE)\nworkspace_audit_log: event_type=''kyc.update''\n  payload.before.gstin, payload.after.gstin, actor_id'
  WHEN '17' THEN E'organization_members: user_id, organization_id\n  role, status=''active'', invited_by'
  WHEN '18' THEN E'drivers: name, phone, license_number\n  status=''active'', organization_id, created_by'
  WHEN '19' THEN E'vehicles: registration_number, vehicle_type\n  capacity_tons, status=''active'', organization_id'
  WHEN '20' THEN E'trip_messages: trip_id, sender_id, content, created_at\ntrip_conversations: last_msg_at (UPDATE)'
END
WHERE id IN ('01','02','03','04','05','06','07','08','09','10',
             '11','12','13','14','15','16','17','18','19','20');
