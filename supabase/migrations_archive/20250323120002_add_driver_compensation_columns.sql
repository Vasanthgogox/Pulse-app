-- Add compensation fields to drivers table
-- This fixes the schema cache error where commission_per_km column is missing

-- Add compensation fields to drivers table
ALTER TABLE drivers
ADD COLUMN IF NOT EXISTS payable_amount NUMERIC(10,2) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS commission_percent NUMERIC(5,2) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS commission_per_km NUMERIC(10,2) DEFAULT NULL;

-- Add indexes for performance on compensation queries
CREATE INDEX IF NOT EXISTS idx_drivers_compensation ON drivers(organization_id, payable_amount, commission_percent, commission_per_km) WHERE payable_amount IS NOT NULL OR commission_percent IS NOT NULL OR commission_per_km IS NOT NULL;

COMMENT ON COLUMN drivers.payable_amount IS 'Fixed salary amount for the driver (nullable)';
COMMENT ON COLUMN drivers.commission_percent IS 'Commission percentage for the driver (nullable)';
COMMENT ON COLUMN drivers.commission_per_km IS 'Per-kilometer rate for the driver (nullable)';
