-- =============================================================================
-- RUN IN SUPABASE SQL EDITOR (Dashboard → SQL → New query)
-- Data backfill only — does NOT ship as a migration. Review SELECTs, then UPDATE.
-- After this, deploy app + run: supabase db push (migration that adds trigger + RPC).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- A) PREVIEW: unlinked drivers that have an email matching an auth user
-- ---------------------------------------------------------------------------
SELECT d.id AS driver_id,
       d.organization_id,
       d.name,
       d.email AS driver_email,
       d.phone,
       d.user_id,
       u.id AS auth_user_id,
       u.email AS auth_email,
       p.role AS profile_role
FROM public.drivers d
JOIN auth.users u
  ON nullif(lower(trim(d.email)), '') = nullif(lower(trim(u.email)), '')
LEFT JOIN public.profiles p ON p.id = u.id
WHERE d.user_id IS NULL
  AND d.left_at IS NULL
  AND nullif(trim(d.email), '') IS NOT NULL;

-- ---------------------------------------------------------------------------
-- B) BACKFILL: set drivers.user_id = auth user id when email matches and
--    profile exists with role = driver (avoids linking dispatcher accounts)
-- ---------------------------------------------------------------------------
BEGIN;

UPDATE public.drivers d
SET user_id = u.id,
    updated_at = now()
FROM auth.users u
INNER JOIN public.profiles p ON p.id = u.id AND p.role = 'driver'
WHERE d.user_id IS NULL
  AND d.left_at IS NULL
  AND nullif(trim(d.email), '') IS NOT NULL
  AND nullif(trim(u.email), '') IS NOT NULL
  AND lower(trim(d.email)) = lower(trim(u.email));

-- Inspect row count / sample:
-- SELECT id, user_id, email FROM public.drivers WHERE updated_at > now() - interval '1 minute';

COMMIT;
-- ROLLBACK;  -- use while testing instead of COMMIT

-- ---------------------------------------------------------------------------
-- C) OPTIONAL: phone last-10 match (only if email was empty on driver row)
--    Uses same helper as product: normalize_phone_last10 (must exist).
--    Review duplicates before running.
-- ---------------------------------------------------------------------------
/*
BEGIN;

UPDATE public.drivers d
SET user_id = p.id,
    updated_at = now()
FROM public.profiles p
WHERE d.user_id IS NULL
  AND d.left_at IS NULL
  AND (d.email IS NULL OR trim(d.email) = '')
  AND d.phone IS NOT NULL
  AND p.role = 'driver'
  AND p.phone IS NOT NULL
  AND public.normalize_phone_last10(d.phone) = public.normalize_phone_last10(p.phone)
  AND length(public.normalize_phone_last10(p.phone)) >= 10;

COMMIT;
*/

-- ---------------------------------------------------------------------------
-- D) SINGLE ROW (replace UUIDs from your preview)
-- ---------------------------------------------------------------------------
/*
UPDATE public.drivers
SET user_id = 'AUTH_USER_UUID_HERE'::uuid,
    updated_at = now()
WHERE id = 'DRIVER_ROW_UUID_HERE'::uuid;
*/

-- ---------------------------------------------------------------------------
-- E) After migration 20260510123000_sync_driver_user_id_from_profile.sql is
--    applied: optional one-shot self-heal per profile (usually unnecessary)
-- ---------------------------------------------------------------------------
/*
SELECT p.id, public.sync_driver_rows_user_id_for_profile(p.id) AS linked_rows
FROM public.profiles p
WHERE p.role = 'driver';
*/
