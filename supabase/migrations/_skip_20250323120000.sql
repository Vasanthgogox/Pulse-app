-- Add compensation fields to drivers table and backfill existing data
-- This fixes the architectural gap where compensation data was only stored in driver_invites

-- Add compensation fields to drivers table
ALTER TABLE drivers
ADD COLUMN IF NOT EXISTS payable_amount NUMERIC(10,2) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS commission_percent NUMERIC(5,2) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS commission_per_km NUMERIC(10,2) DEFAULT NULL;

-- Backfill compensation data from driver_invites to drivers for already accepted invites
UPDATE drivers d
SET 
    payable_amount = i.payable_amount,
    commission_percent = i.commission_percent,
    commission_per_km = i.commission_per_km
FROM driver_invites i
WHERE 
    d.user_id = i.to_user_id 
    AND d.organization_id = i.from_organization_id
    AND i.status = 'accepted'
    AND d.user_id IS NOT NULL
    AND (
        d.payable_amount IS NULL 
        OR d.commission_percent IS NULL 
        OR d.commission_per_km IS NULL
    );

-- Add indexes for performance on compensation queries
CREATE INDEX IF NOT EXISTS idx_drivers_compensation ON drivers(organization_id, payable_amount, commission_percent, commission_per_km) WHERE payable_amount IS NOT NULL OR commission_percent IS NOT NULL OR commission_per_km IS NOT NULL;

COMMENT ON COLUMN drivers.payable_amount IS 'Fixed salary amount for the driver (nullable)';
COMMENT ON COLUMN drivers.commission_percent IS 'Commission percentage for the driver (nullable)';
COMMENT ON COLUMN drivers.commission_per_km IS 'Per-kilometer rate for the driver (nullable)';
