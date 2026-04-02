-- Store invitee display name at invite creation time so sender UI can render it deterministically.

ALTER TABLE public.driver_invites
ADD COLUMN IF NOT EXISTS invitee_name text;

-- Backfill existing rows so the Network Hub can show deterministic names.
-- O(n) update over invite rows.
UPDATE public.driver_invites di
SET invitee_name = COALESCE(
  NULLIF(trim(p.full_name), ''),
  NULLIF(trim(u.raw_user_meta_data->>'full_name'), ''),
  NULLIF(trim(u.raw_user_meta_data->>'name'), ''),
  NULLIF(trim(u.raw_user_meta_data->>'phone'), ''),
  NULLIF(trim(p.phone), ''),
  'Driver'
)
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE di.to_user_id = u.id
  AND (di.invitee_name IS NULL OR trim(coalesce(di.invitee_name, '')) = '');

