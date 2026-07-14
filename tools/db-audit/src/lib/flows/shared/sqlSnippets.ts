/** Placeholder for audit SQL — substitute session user id. */
export const AUTH_UID = 'auth.uid()';

export const RPC_GET_EMAIL_BY_PHONE = `SELECT public.get_email_by_phone(:phone_10_digits);
-- Under the hood (profiles phone normalize):
-- SELECT trim(pr.email) FROM public.profiles pr
-- WHERE normalize_last_10(pr.phone) = :phone_10_digits LIMIT 1;`;

/** Driver phone sign-in — Edge check-user-by-phone with intent=driver_signin */
export const EDGE_DRIVER_PHONE_SIGNIN = `-- Edge: check-user-by-phone POST { phone, intent: 'driver_signin' }
-- 1) admin.rpc get_email_by_phone (or profiles scan)
-- 2) _shared/driverSessionExchange.exchangeMagicLinkForSession(email)
--    → { email, session: { access_token, refresh_token } }
--    OR { email, magicLinkToken } for client verifyOtp
-- Legacy fallback Edge: driver-phone-signin-unverified { phone } (same contract)
-- Verified path (SMS): link-driver-phone — JWT phone only; get_driver_invitee_by_phone`;

export const RPC_ORG_NAME_TAKEN = `SELECT public.organization_name_is_taken(:company_name);
-- Equivalent:
-- SELECT EXISTS (
--   SELECT 1 FROM public.organizations o
--   WHERE lower(btrim(o.name)) = lower(btrim(:company_name))
-- );`;

export const RPC_RESOLVE_TEAM_INVITES = `SELECT public.expire_stale_team_invitations(p_phone := :phone);
SELECT * FROM public.resolve_pending_team_invitations_by_phone(p_phone := :phone);`;

export const RPC_ACCEPT_TEAM_INVITE = `SELECT public.accept_pending_team_invitation(p_invite_id := :invite_id);
-- Writes: organization_members INSERT/UPDATE, organization_team_invites.status = accepted`;

export const RPC_UPDATE_ORG_LOGO = `SELECT public.update_organization_logo(
  p_org_id := :org_id,
  p_logo_url := :storage_path
);
-- Fallback PostgREST:
-- UPDATE public.organizations SET logo_url = :path WHERE id = :org_id;`;

export const SIGNUP_AUTH_INSERT = `-- Client: supabase.auth.signUp({ email, password, options: { data: metadata } })
-- INSERT auth.users (+ email identity); metadata → raw_user_meta_data`;

export const HANDLE_NEW_USER_TRIGGER = `-- AFTER INSERT ON auth.users → handle_new_user()

INSERT INTO public.users (id, name) VALUES (:id, :display_name)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.profiles (id, email, full_name, role, aggregated, asset, company_name, phone)
VALUES (:id, :email, :display_name, :role, :aggregated, :asset, :company_name, :phone)
ON CONFLICT (id) DO NOTHING;

-- Owner only (role=user AND onboarding_type=owner):
INSERT INTO public.organizations (owner_id, name, operating_model, address_line, ...)
VALUES (...from raw_user_meta_data...);

INSERT INTO public.organization_members (organization_id, user_id, role, status)
VALUES (:org_id, :id, 'owner', 'active')
ON CONFLICT DO UPDATE SET status = 'active', role = 'owner';`;

export const PROFILE_UPDATE = `UPDATE public.profiles SET :columns WHERE id = ${AUTH_UID};
-- Plus: supabase.auth.updateUser({ data }) → auth.users.raw_user_meta_data`;

export const ORG_RESOLVE_FOR_USER = `SELECT organization_id FROM public.organization_members
WHERE user_id = ${AUTH_UID} AND status = 'active'
ORDER BY created_at LIMIT 1;`;

export const RPC_GET_TRIPS_FOR_ORG = `SELECT * FROM public.get_trips_for_org(p_org_id := :org_id);
-- Includes cross-org supplier trips visible to org`;

export const ORG_VERIFICATION_READ = `SELECT id, name, verification_status, kyc_submitted_at
FROM public.organizations
WHERE id = :org_id;`;

export const DRIVER_ASSIGNED_TRIPS = `SELECT t.*
FROM public.trips t
JOIN public.drivers d ON d.id = t.driver_id
WHERE d.user_id = ${AUTH_UID}
ORDER BY t.created_at DESC;`;

export const TRIP_INSERT_ASSET = `INSERT INTO public.trips (
  organization_id,
  owner_user_id,
  created_by_user_id,
  pickup_area,
  drop_location,
  pickup_lat,
  pickup_lon,
  drop_lat,
  drop_lon,
  distance,
  estimated_duration,
  client_id,
  client_name,
  client_price,
  supplier_id,
  supplier_rate,
  driver_id,
  vehicle_id,
  driver_commission_percent,
  driver_commission_per_km,
  load_tons,
  load_type,
  pickup_date,
  advance_paid,
  notes,
  status,
  trip_payout_mode
) VALUES (
  :org_id,
  :owner_user_id,
  :created_by_user_id,
  :pickup_area,
  :drop_location,
  :pickup_lat,
  :pickup_lon,
  :drop_lat,
  :drop_lon,
  :distance,
  :estimated_duration,
  :client_id,
  :client_name,
  :client_price,
  :supplier_id,
  :supplier_rate,
  :driver_id,
  :vehicle_id,
  :driver_commission_percent,
  :driver_commission_per_km,
  :load_tons,
  :load_type,
  :pickup_date,
  :advance_paid,
  :notes,
  'assigned',
  'asset'
);
-- trips.service createTrip — asset fleet path
-- Pre-check: getDriverOngoingTrip / getVehicleOngoingTrip when driver_id or vehicle_id set`;

export const TRIP_INSERT_AGGREGATE = `INSERT INTO public.trips (
  organization_id,
  owner_user_id,
  created_by_user_id,
  pickup_area,
  drop_location,
  pickup_lat,
  pickup_lon,
  drop_lat,
  drop_lon,
  distance,
  estimated_duration,
  client_id,
  client_name,
  client_price,
  supplier_id,
  supplier_rate,
  vehicle_display_number,
  load_tons,
  load_type,
  pickup_date,
  advance_paid,
  notes,
  status,
  trip_payout_mode
) VALUES (
  :org_id,
  :owner_user_id,
  :created_by_user_id,
  :pickup_area,
  :drop_location,
  :pickup_lat,
  :pickup_lon,
  :drop_lat,
  :drop_lon,
  :distance,
  :estimated_duration,
  :client_id,
  :client_name,
  :client_price,
  :supplier_id,
  :supplier_rate,
  :vehicle_display_number,
  :load_tons,
  :load_type,
  :pickup_date,
  :advance_paid,
  :notes,
  'assigned',
  'market'
);
-- trips.service createTrip / createTripWithOtp — aggregate (supplier) path
-- trip_payout_mode = market when supplySource = aggregate`;

export const TRIP_INSERT = TRIP_INSERT_ASSET;

export const TRIP_DETAIL_READ = `SELECT t.*
FROM public.trips t
WHERE t.id = :trip_id;

SELECT * FROM public.trip_adjustments WHERE trip_id = :trip_id;
SELECT * FROM public.transactions WHERE trip_id = :trip_id;
SELECT * FROM public.trip_documents WHERE trip_id = :trip_id;
SELECT * FROM public.indents WHERE trip_id = :trip_id;
-- useTripDetail · getTripById`;

export const TRIP_STATUS_UPDATE = `UPDATE public.trips
SET status = :next_status,
    started_at = COALESCE(:started_at, started_at),
    completed_at = COALESCE(:completed_at, completed_at)
WHERE id = :trip_id;`;

export const GENERATE_TRIP_OTP = `INSERT INTO public.trip_otp_codes (trip_id, code, expires_at)
VALUES (:trip_id, :code, :expires_at)
ON CONFLICT (trip_id) DO UPDATE
SET code = EXCLUDED.code, expires_at = EXCLUDED.expires_at;
-- tripOtp.service generateTripOtp
-- createTripWithOtp when aggregate + has assignment (driver/vehicle/display number)
-- Skipped when skipOtpGeneration=true (phone assign path on create)`;

export const ASSIGN_DRIVER_BY_PHONE = `-- drivers.service ensureDriverRowByPhone (INSERT drivers if missing)
INSERT INTO public.drivers (organization_id, name, phone, status)
VALUES (:org_id, :name, :normalized_phone, 'offline')
ON CONFLICT DO NOTHING;

UPDATE public.trips
SET driver_id = :driver_id,
    changed_by = :changed_by
WHERE id = :trip_id;
-- trips.service assignTripDriverByPhone → updateTripAssignment
-- Options: trackingOnly, forceOtpClaim, skipOtpGeneration
-- If driver has no user_id → generateTripOtp for claim flow`;

export const ASSIGN_AGGREGATE_DRIVER_RPC = `SELECT public.assign_aggregate_trip_driver(
  p_trip_id := :trip_id,
  p_driver_org_id := :org_id,
  p_driver_phone := :normalized_phone,
  p_vehicle_display_number := :vehicle_display_number,
  p_vehicle_id := :vehicle_id,
  p_driver_name := :driver_name
);
-- trips.service assignAggregateTripDriverByPhone
-- Fallback: assignTripDriverByPhone + updateTripAssignment when RPC signature stale`;

export const UPDATE_TRIP_ASSIGNMENT = `UPDATE public.trips
SET driver_id = COALESCE(:driver_id, driver_id),
    vehicle_id = COALESCE(:vehicle_id, vehicle_id),
    supplier_id = COALESCE(:supplier_id, supplier_id),
    vehicle_display_number = COALESCE(:vehicle_display_number, vehicle_display_number),
    changed_by = :changed_by
WHERE id = :trip_id;
-- trips.service updateTripAssignment
-- TripAssignmentFlowScreen · TripAssignmentBlock fleet pickers`;

export const LEDGER_ADVANCE_SUPPLIER = `INSERT INTO public.transactions (
  organization_id,
  trip_id,
  party_name,
  description,
  amount_in,
  amount_out,
  contact_id,
  contact_type
) VALUES (
  :org_id,
  :trip_id,
  'Advance',
  'Trip Payment',
  0,
  :advance_paid,
  :supplier_id,
  'supplier'
);
-- finance createLedgerEntry when advance_paid > 0 on aggregate create`;

export const CLIENT_INSERT = `INSERT INTO public.clients (
  organization_id,
  name,
  phone,
  email,
  address,
  gstin,
  contact_person,
  pan_number,
  notes,
  is_integrated,
  created_by
) VALUES (
  :org_id,
  :name,
  :phone,
  :email,
  :address,
  :gstin,
  :contact_person,
  :pan_number,
  :notes,
  :is_integrated,
  :created_by
);
-- clients.service createClient → CustomerService.createClientRecord
-- Quick-add: name from organizationName OR contactPerson`;

export const SUPPLIER_OFFLINE_INSERT = `INSERT INTO public.suppliers (
  organization_id,
  name,
  contact_person,
  phone,
  email,
  address,
  is_active,
  is_verified,
  operating_areas,
  vehicle_types,
  supplier_type
) VALUES (
  :org_id,
  :name,
  :contact_person,
  :phone,
  :email,
  :address,
  true,
  false,
  :operating_areas,
  :vehicle_types,
  'offline'
);
-- suppliers.service createSupplier — default supplier_type = offline`;

export const DRIVER_OFFLINE_INSERT = `INSERT INTO public.drivers (
  organization_id,
  name,
  phone,
  email,
  status,
  payable_amount,
  commission_percent,
  commission_per_km
) VALUES (
  :org_id,
  :name,
  :phone,
  :email,
  'offline',
  :payable_amount,
  :commission_percent,
  :commission_per_km
);
-- drivers.service createDriver — roster row before app link`;

export const VEHICLE_INSERT = `INSERT INTO public.vehicles (
  organization_id,
  vehicle_number,
  vehicle_type,
  capacity,
  vehicle_brand,
  vehicle_model,
  vehicle_body_type,
  vehicle_size,
  vehicle_axle,
  documents,
  status,
  type
) VALUES (
  :org_id,
  :vehicle_number,
  :vehicle_type,
  :capacity,
  :vehicle_brand,
  :vehicle_model,
  :vehicle_body_type,
  :vehicle_size,
  :vehicle_axle,
  :documents,
  'active',
  :type
);
-- type = 'owned' (organization) | 'adhoc' (partner)
-- vehicles.service createVehicle`;
