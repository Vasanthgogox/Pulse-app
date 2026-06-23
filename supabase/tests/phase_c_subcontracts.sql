-- Phase C regression checks for trip_subcontracts + transactions.payment_ref
-- Run sections in Supabase SQL editor (service_role for setup; authenticated JWT for RLS).

-- ── 0) Column inventory ──────────────────────────────────────────────────────
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'trip_subcontracts'
ORDER BY ordinal_position;

-- ── 1–3) On-platform subcontract + sub_trip_code (service_role setup) ────────
-- Replace UUIDs with real org/trip/supplier ids from your seed data.

/*
WITH shipper_trip AS (
  SELECT t.id AS trip_id, t.booking_ref
  FROM public.trips t
  WHERE t.booking_ref IS NOT NULL
  LIMIT 1
)
INSERT INTO public.trip_subcontracts (
  viewer_org_id,
  trip_id,
  supplier_id,
  rate,
  sub_supplier_on_platform,
  sub_supplier_org_id,
  status
)
SELECT
  '<sourcing_org_uuid>'::uuid,
  shipper_trip.trip_id,
  '<supplier_row_uuid>'::uuid,
  5000,
  true,
  '<linked_org_uuid>'::uuid,
  'pending'
FROM shipper_trip
RETURNING id, sub_trip_code;
-- Expect: sub_trip_code LIKE '%-SUB-%' (e.g. GGV234-SUB-x7km2p)
*/

-- ── 4) Shipper org RLS: must return 0 rows ─────────────────────────────────
-- Sign in as shipper org member (trip owner), then:
--   SELECT * FROM trip_subcontracts;
-- Expect: 0 rows (no policy grants shipper read).

-- ── 5) Off-platform subcontract ──────────────────────────────────────────────
/*
INSERT INTO public.trip_subcontracts (
  viewer_org_id,
  trip_id,
  sub_supplier_on_platform,
  sub_supplier_name,
  sub_supplier_phone,
  rate,
  status
) VALUES (
  '<sourcing_org_uuid>'::uuid,
  '<parent_trip_uuid>'::uuid,
  false,
  'Ravi Transport',
  '+919876543210',
  4200,
  'pending'
)
RETURNING id, sub_trip_code, sub_supplier_name;
*/

-- ── 6) CHECK constraint: on_platform=true without org_id must fail ─────────
DO $$
BEGIN
  INSERT INTO public.trip_subcontracts (
    viewer_org_id,
    trip_id,
    sub_supplier_on_platform,
    sub_supplier_name,
    rate
  ) VALUES (
    gen_random_uuid(),
    gen_random_uuid(),
    true,
    'Should fail',
    0
  );
  RAISE EXCEPTION 'CHECK chk_sub_supplier_identity should have blocked insert';
EXCEPTION
  WHEN check_violation THEN
    RAISE NOTICE 'OK: chk_sub_supplier_identity blocked on_platform=true without org_id';
END $$;

-- ── 6b) CHECK constraint: on_platform=false without name must fail ───────────
DO $$
BEGIN
  INSERT INTO public.trip_subcontracts (
    viewer_org_id,
    trip_id,
    sub_supplier_on_platform,
    sub_supplier_org_id,
    rate
  ) VALUES (
    gen_random_uuid(),
    gen_random_uuid(),
    false,
    gen_random_uuid(),
    0
  );
  RAISE EXCEPTION 'CHECK chk_sub_supplier_identity should have blocked insert';
EXCEPTION
  WHEN check_violation THEN
    RAISE NOTICE 'OK: chk_sub_supplier_identity blocked on_platform=false without name';
END $$;

-- ── 7–10) payment_ref trigger on transactions ────────────────────────────────
/*
-- Requires existing trip with booking_ref and valid organization_id for transactions.
WITH t AS (
  SELECT booking_ref FROM public.trips WHERE booking_ref IS NOT NULL LIMIT 1
)
INSERT INTO public.transactions (
  organization_id,
  party_name,
  description,
  amount_in,
  amount_out,
  booking_ref
)
SELECT
  '<org_uuid>'::uuid,
  'Test Client',
  'Phase C payment ref test 1',
  100,
  0,
  t.booking_ref
FROM t
RETURNING booking_ref, payment_ref;
-- Expect: payment_ref = PAY-{booking_ref}-00

INSERT INTO public.transactions (
  organization_id,
  party_name,
  description,
  amount_in,
  amount_out,
  booking_ref
)
SELECT
  '<org_uuid>'::uuid,
  'Test Client',
  'Phase C payment ref test 2',
  50,
  0,
  t.booking_ref
FROM (SELECT booking_ref FROM public.trips WHERE booking_ref IS NOT NULL LIMIT 1) t
RETURNING booking_ref, payment_ref;
-- Expect: payment_ref = PAY-{booking_ref}-01
*/

-- ── FK: transactions.booking_ref → trips.booking_ref ───────────────────────
SELECT
  tc.constraint_name,
  kcu.column_name,
  ccu.table_name AS foreign_table,
  ccu.column_name AS foreign_column
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.table_name = 'transactions'
  AND tc.constraint_type = 'FOREIGN KEY'
  AND kcu.column_name = 'booking_ref';
