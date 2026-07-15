-- Align organization_locations.location_type with Network workspace UI.
-- UI supports registered_office, branch_office, warehouse, etc.; original check allowed only 4 values.

ALTER TABLE public.organization_locations
  DROP CONSTRAINT IF EXISTS organization_locations_location_type_check;

ALTER TABLE public.organization_locations
  ADD CONSTRAINT organization_locations_location_type_check
  CHECK (location_type IN (
    'registered_office',
    'branch_office',
    'primary_hub',
    'regional_office',
    'dispatch_center',
    'warehouse',
    'other'
  ));
