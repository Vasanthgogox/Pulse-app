-- REVIEW ONLY — do not run unattended. Wrapped in a transaction that ROLLS
-- BACK by default; swap the final ROLLBACK for COMMIT once the output looks
-- right, and run it in a confirmed quiet window.
--
-- Anomaly: indents.weight is stored in KG, but four rows hold tonnes. They
-- share one created_at (2026-07-27 04:58:49.865925+00), so this is seed/import
-- data, not user entry. A 25 kg "32ft Single Axle" load is not physical, and
-- because per-MT pricing now multiplies by weight/1000, these rows would
-- expand a per-MT target against 0.025 t and produce a ~₹80 trip target.
--
-- Scope note: the original report called this "IND089, 25 kg -> 25 MT", but
-- display_indent_id is NOT unique — two different loads both answer to IND089
-- (Salem->Mumbai at 25, and Bhandara->Bengaluru at 60000, which is correct).
-- So every statement below targets the UUID. Fixing by display_indent_id would
-- have corrupted the healthy Bhandara row.
--
-- Deliberately EXCLUDED: IND005 (92b3749f-...) at 500 kg on a Tata Ace. That
-- is a real sub-tonne load in the correct unit, created three weeks later by a
-- different path. A blanket `weight < 1000` rule would wrongly inflate it to
-- 500 t, so it is left alone.

BEGIN;

-- 1. Before.
SELECT
  id,
  display_indent_id,
  pickup_area || ' -> ' || drop_location AS lane,
  vehicle_type,
  weight        AS weight_now_kg,
  weight * 1000 AS weight_after_kg,
  client_price,
  status
FROM public.indents
WHERE id IN (
  'a0a8d063-ed9b-4638-92de-2a0f7fb64e00', -- IND089 Salem -> Mumbai,        25 -> 25000
  '8c81041e-3f35-4fd8-99b2-eaaa3c9a4689', -- IND088 Madurai -> Hyderabad,   14 -> 14000
  '5b842b73-cd13-4e4d-9a4e-80d87329a985', -- IND087 Coimbatore -> Kochi,    16 -> 16000
  '3a36b1f4-c0a9-48f5-8b70-ed531271cd15'  -- IND086 Chennai -> Bengaluru,   21 -> 21000
)
ORDER BY display_indent_id;

-- 2. Correct tonnes -> KG. The `weight < 1000` guard makes this idempotent:
--    a second run matches nothing because the rows are then >= 1000.
UPDATE public.indents
   SET weight = weight * 1000
 WHERE id IN (
   'a0a8d063-ed9b-4638-92de-2a0f7fb64e00',
   '8c81041e-3f35-4fd8-99b2-eaaa3c9a4689',
   '5b842b73-cd13-4e4d-9a4e-80d87329a985',
   '3a36b1f4-c0a9-48f5-8b70-ed531271cd15'
 )
   AND weight > 0
   AND weight < 1000;

-- 3. After. Expect 25000 / 14000 / 16000 / 21000.
SELECT
  id,
  display_indent_id,
  pickup_area || ' -> ' || drop_location AS lane,
  vehicle_type,
  weight AS weight_kg,
  status
FROM public.indents
WHERE id IN (
  'a0a8d063-ed9b-4638-92de-2a0f7fb64e00',
  '8c81041e-3f35-4fd8-99b2-eaaa3c9a4689',
  '5b842b73-cd13-4e4d-9a4e-80d87329a985',
  '3a36b1f4-c0a9-48f5-8b70-ed531271cd15'
)
ORDER BY display_indent_id;

-- 4. Anything still under a tonne. Expect exactly one row: IND005 / Tata Ace
--    / 500 kg, which is legitimately sub-tonne.
SELECT display_indent_id, vehicle_type, weight
FROM public.indents
WHERE weight > 0 AND weight < 1000
ORDER BY weight;

-- Swap to COMMIT after reviewing the output above.
ROLLBACK;
