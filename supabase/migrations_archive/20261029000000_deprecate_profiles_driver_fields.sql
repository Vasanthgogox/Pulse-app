-- Migration: Deprecate legacy driver KYC columns on profiles
-- Source of truth for all these fields is driver_profiles (keyed by user_id = profiles.id)

-- ──────────────────────────────────────────────
-- Step 1: Backfill driver_profiles from profiles
-- ──────────────────────────────────────────────

-- Create driver_profiles rows for profiles that have driver data but no dp row yet
INSERT INTO driver_profiles (
  user_id,
  license_number,
  license_type,
  license_expiry,
  license_photo_url,
  vehicle_registration,
  vehicle_registration_photo_url,
  vehicle_registration_expiry,
  insurance_photo_url,
  insurance_expiry,
  years_of_experience,
  languages,
  preferred_vehicle_types,
  preferred_areas,
  emergency_contact_name,
  emergency_contact_phone
)
SELECT
  p.id,
  p.license_number,
  p.license_type,
  p.license_expiry,
  p.license_photo_url,
  p.vehicle_registration,
  p.vehicle_registration_photo_url,
  p.vehicle_registration_expiry,
  p.insurance_photo_url,
  p.insurance_expiry,
  p.years_of_experience,
  p.languages,
  p.preferred_vehicle_types,
  p.preferred_areas,
  p.emergency_contact_name,
  p.emergency_contact_phone
FROM profiles p
LEFT JOIN driver_profiles dp ON dp.user_id = p.id
WHERE dp.id IS NULL
  AND (
    p.license_number IS NOT NULL OR
    p.license_type IS NOT NULL OR
    p.license_expiry IS NOT NULL OR
    p.license_photo_url IS NOT NULL OR
    p.vehicle_registration IS NOT NULL OR
    p.vehicle_registration_photo_url IS NOT NULL OR
    p.vehicle_registration_expiry IS NOT NULL OR
    p.insurance_photo_url IS NOT NULL OR
    p.insurance_expiry IS NOT NULL OR
    p.years_of_experience IS NOT NULL OR
    p.emergency_contact_name IS NOT NULL OR
    p.emergency_contact_phone IS NOT NULL
  );

-- Backfill existing driver_profiles rows with any non-null values from profiles
-- (only sets the dp column if it is currently null and profiles has a value)
UPDATE driver_profiles dp
SET
  license_number              = COALESCE(dp.license_number,              p.license_number),
  license_type                = COALESCE(dp.license_type,                p.license_type),
  license_expiry              = COALESCE(dp.license_expiry,              p.license_expiry),
  license_photo_url           = COALESCE(dp.license_photo_url,           p.license_photo_url),
  vehicle_registration        = COALESCE(dp.vehicle_registration,        p.vehicle_registration),
  vehicle_registration_photo_url = COALESCE(dp.vehicle_registration_photo_url, p.vehicle_registration_photo_url),
  vehicle_registration_expiry = COALESCE(dp.vehicle_registration_expiry, p.vehicle_registration_expiry),
  insurance_photo_url         = COALESCE(dp.insurance_photo_url,         p.insurance_photo_url),
  insurance_expiry            = COALESCE(dp.insurance_expiry,            p.insurance_expiry),
  years_of_experience         = COALESCE(dp.years_of_experience,         p.years_of_experience),
  languages                   = CASE WHEN dp.languages = '{}' OR dp.languages IS NULL THEN p.languages ELSE dp.languages END,
  preferred_vehicle_types     = CASE WHEN dp.preferred_vehicle_types = '{}' OR dp.preferred_vehicle_types IS NULL THEN p.preferred_vehicle_types ELSE dp.preferred_vehicle_types END,
  preferred_areas             = CASE WHEN dp.preferred_areas = '{}' OR dp.preferred_areas IS NULL THEN p.preferred_areas ELSE dp.preferred_areas END,
  emergency_contact_name      = COALESCE(dp.emergency_contact_name,      p.emergency_contact_name),
  emergency_contact_phone     = COALESCE(dp.emergency_contact_phone,     p.emergency_contact_phone)
FROM profiles p
WHERE dp.user_id = p.id;

-- ──────────────────────────────────────────────
-- Step 2: Mark columns deprecated via COMMENT
-- ──────────────────────────────────────────────

COMMENT ON COLUMN profiles.license_number               IS 'DEPRECATED: use driver_profiles.license_number';
COMMENT ON COLUMN profiles.license_type                 IS 'DEPRECATED: use driver_profiles.license_type';
COMMENT ON COLUMN profiles.license_expiry               IS 'DEPRECATED: use driver_profiles.license_expiry';
COMMENT ON COLUMN profiles.license_photo_url            IS 'DEPRECATED: use driver_profiles.license_photo_url';
COMMENT ON COLUMN profiles.vehicle_registration         IS 'DEPRECATED: use driver_profiles.vehicle_registration';
COMMENT ON COLUMN profiles.vehicle_registration_photo_url IS 'DEPRECATED: use driver_profiles.vehicle_registration_photo_url';
COMMENT ON COLUMN profiles.vehicle_registration_expiry  IS 'DEPRECATED: use driver_profiles.vehicle_registration_expiry';
COMMENT ON COLUMN profiles.insurance_photo_url          IS 'DEPRECATED: use driver_profiles.insurance_photo_url';
COMMENT ON COLUMN profiles.insurance_expiry             IS 'DEPRECATED: use driver_profiles.insurance_expiry';
COMMENT ON COLUMN profiles.years_of_experience          IS 'DEPRECATED: use driver_profiles.years_of_experience';
COMMENT ON COLUMN profiles.languages                    IS 'DEPRECATED: use driver_profiles.languages';
COMMENT ON COLUMN profiles.preferred_vehicle_types      IS 'DEPRECATED: use driver_profiles.preferred_vehicle_types';
COMMENT ON COLUMN profiles.preferred_areas              IS 'DEPRECATED: use driver_profiles.preferred_areas';
COMMENT ON COLUMN profiles.emergency_contact_name       IS 'DEPRECATED: use driver_profiles.emergency_contact_name';
COMMENT ON COLUMN profiles.emergency_contact_phone      IS 'DEPRECATED: use driver_profiles.emergency_contact_phone';

-- ──────────────────────────────────────────────
-- Step 3: Trigger to block new writes to legacy columns
-- ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION profiles_block_deprecated_driver_fields()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF (
    NEW.license_number IS DISTINCT FROM OLD.license_number OR
    NEW.license_type IS DISTINCT FROM OLD.license_type OR
    NEW.license_expiry IS DISTINCT FROM OLD.license_expiry OR
    NEW.license_photo_url IS DISTINCT FROM OLD.license_photo_url OR
    NEW.vehicle_registration IS DISTINCT FROM OLD.vehicle_registration OR
    NEW.vehicle_registration_photo_url IS DISTINCT FROM OLD.vehicle_registration_photo_url OR
    NEW.vehicle_registration_expiry IS DISTINCT FROM OLD.vehicle_registration_expiry OR
    NEW.insurance_photo_url IS DISTINCT FROM OLD.insurance_photo_url OR
    NEW.insurance_expiry IS DISTINCT FROM OLD.insurance_expiry OR
    NEW.years_of_experience IS DISTINCT FROM OLD.years_of_experience OR
    NEW.languages IS DISTINCT FROM OLD.languages OR
    NEW.preferred_vehicle_types IS DISTINCT FROM OLD.preferred_vehicle_types OR
    NEW.preferred_areas IS DISTINCT FROM OLD.preferred_areas OR
    NEW.emergency_contact_name IS DISTINCT FROM OLD.emergency_contact_name OR
    NEW.emergency_contact_phone IS DISTINCT FROM OLD.emergency_contact_phone
  ) THEN
    RAISE EXCEPTION
      'profiles: direct writes to deprecated driver KYC columns are blocked. Write to driver_profiles instead (join on user_id = profiles.id).';
  END IF;
  RETURN NEW;
END;
$$;

-- Only fires on UPDATE (INSERT via trigger is rare here; new signups only write to driver_profiles)
DROP TRIGGER IF EXISTS trg_profiles_block_deprecated_driver_fields ON profiles;
CREATE TRIGGER trg_profiles_block_deprecated_driver_fields
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION profiles_block_deprecated_driver_fields();

-- ──────────────────────────────────────────────
-- Down (undo)
-- ──────────────────────────────────────────────
-- To revert:
-- DROP TRIGGER trg_profiles_block_deprecated_driver_fields ON profiles;
-- DROP FUNCTION profiles_block_deprecated_driver_fields();
-- COMMENT ON COLUMN profiles.license_number IS NULL; -- (repeat for all 15 columns)
