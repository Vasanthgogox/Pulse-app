-- Aggregate phone assignment / OTP claim must NOT auto-promote a driver into
-- "employer / fleet" employment.
--
-- Bug (Vincent / 9999988888 × Godrej):
-- 1) Godrej assigned an aggregate trip by phone → tracking_only driver stub.
-- 2) Individual driver signup ran sync_driver_rows_user_id_for_profile and linked
--    that stub by phone.
-- 3) Trigger clear_tracking_only_on_user_link forced tracking_only = false,
--    so the app treated Godrej as the driver's employer without an accepted
--    salary/commission invite.
--
-- Correct product rule:
-- - tracking_only rows may carry user_id for OTP trip claim, but stay non-employer.
-- - Employer / payroll only after accept_driver_invite (sets tracking_only = false).
-- - Signup phone sync must not attach employer fleets that are only tracking stubs.

-- 1) Stop auto-clearing tracking_only whenever user_id is set.
DROP TRIGGER IF EXISTS trg_clear_tracking_only_on_user_link ON public.drivers;
DROP FUNCTION IF EXISTS public.clear_tracking_only_on_user_link();

-- 2) Signup sync: only link real roster/employer rows (tracking_only = false),
--    and only when there is an accepted employer invite for that org + phone/user.
--    Tracking stubs stay linked only via claim_trip_by_otp for that trip.
CREATE OR REPLACE FUNCTION public.sync_driver_rows_user_id_for_profile(p_profile_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_email_norm text;
  v_last10 text;
  v_full_name text;
  v_n int := 0;
BEGIN
  SELECT p.role,
         nullif(lower(trim(coalesce(p.email, ''))), ''),
         public.normalise_phone(p.phone),
         nullif(trim(coalesce(p.full_name, '')), '')
    INTO v_role, v_email_norm, v_last10, v_full_name
  FROM public.profiles p
  WHERE p.id = p_profile_id;

  IF NOT FOUND OR coalesce(v_role, '') <> 'driver' THEN
    RETURN 0;
  END IF;

  UPDATE public.drivers d
  SET user_id = p_profile_id,
      status = 'offline',
      name = CASE
        WHEN v_full_name IS NOT NULL AND v_full_name <> '' THEN v_full_name
        ELSE d.name
      END,
      updated_at = now()
  WHERE d.user_id IS NULL
    AND d.left_at IS NULL
    AND coalesce(d.tracking_only, false) = false
    AND (
      (v_email_norm IS NOT NULL AND v_email_norm <> ''
        AND nullif(lower(trim(coalesce(d.email, ''))), '') = v_email_norm)
      OR (
        length(coalesce(v_last10, '')) >= 10
        AND d.phone_normalised = v_last10
      )
    )
    AND EXISTS (
      SELECT 1
      FROM public.driver_invites i
      WHERE i.from_organization_id = d.organization_id
        AND i.deleted_at IS NULL
        AND lower(coalesce(i.status, '')) = 'accepted'
        AND (
          i.to_user_id = p_profile_id
          OR (
            length(coalesce(v_last10, '')) >= 10
            AND i.phone_normalised = v_last10
          )
          OR i.driver_id = d.id
        )
    );

  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;

COMMENT ON FUNCTION public.sync_driver_rows_user_id_for_profile(uuid) IS
  'Links roster drivers.user_id for a driver profile only when tracking_only=false AND an accepted employer invite exists for that org/phone. Does not promote aggregate tracking stubs into employers.';

-- 3) Repair wrong auto-employer links: demote to tracking_only but KEEP user_id
-- so trip History (joined via drivers.user_id) still lists trips they operated.
-- If clearing employer UX only, do not wipe the operator link.
UPDATE public.drivers d
SET tracking_only = true,
    updated_at = now()
WHERE d.left_at IS NULL
  AND d.user_id IS NOT NULL
  AND coalesce(d.tracking_only, false) = false
  AND d.payable_amount IS NULL
  AND d.commission_percent IS NULL
  AND d.commission_per_km IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.driver_invites i
    WHERE i.from_organization_id = d.organization_id
      AND i.deleted_at IS NULL
      AND lower(coalesce(i.status, '')) = 'accepted'
      AND (
        i.to_user_id = d.user_id
        OR i.driver_id = d.id
        OR (
          d.phone_normalised IS NOT NULL
          AND length(d.phone_normalised) >= 10
          AND i.phone_normalised = d.phone_normalised
        )
      )
  );
