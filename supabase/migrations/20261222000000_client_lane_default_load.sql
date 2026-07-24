-- Add default load type + default tonnage to client lane rates so indent /
-- trip creation can auto-populate these from a selected contract lane.
-- Previously the lane only stored a rate + rate_type ("per ton" is a pricing
-- unit, not a weight), so users had to re-enter load type and tonnage on every
-- indent. These two optional columns let a lane carry sensible defaults.
ALTER TABLE public.client_lane_rates
  ADD COLUMN IF NOT EXISTS default_load_type text,
  ADD COLUMN IF NOT EXISTS default_load_tons numeric;

COMMENT ON COLUMN public.client_lane_rates.default_load_type IS
  'Optional default load/commodity type auto-filled into indents created from this lane.';
COMMENT ON COLUMN public.client_lane_rates.default_load_tons IS
  'Optional default load weight in TONS (not kg) auto-filled into indents created from this lane.';
