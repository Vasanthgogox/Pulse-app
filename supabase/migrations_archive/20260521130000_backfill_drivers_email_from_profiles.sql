-- One-time backfill: persist login email on drivers row for exports, raw selects, and legacy paths.
UPDATE public.drivers d
SET email = NULLIF(BTRIM(p.email::text), '')
FROM public.profiles p
WHERE p.id = d.user_id
  AND d.user_id IS NOT NULL
  AND (d.email IS NULL OR BTRIM(COALESCE(d.email, '')::text) = '')
  AND p.email IS NOT NULL
  AND BTRIM(COALESCE(p.email, '')::text) <> '';
