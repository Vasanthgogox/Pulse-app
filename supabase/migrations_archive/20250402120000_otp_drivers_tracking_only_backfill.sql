-- Ensure tracking_only exists (idempotent with 20250401120000) then backfill OTP-only drivers.
-- So one push works even if the column was never added on remote.

ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS tracking_only boolean NOT NULL DEFAULT false;

-- One-time backfill: mark legacy OTP-only drivers as tracking_only so they disappear from Drivers tab.
UPDATE public.drivers d
SET tracking_only = true
WHERE (d.tracking_only IS NULL OR d.tracking_only = false)
  AND d.user_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.driver_invites di
    WHERE di.to_user_id = d.user_id
      AND di.from_organization_id = d.organization_id
      AND di.status = 'accepted'
  );
