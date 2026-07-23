-- Speed up the contract-lane picker's server-side ILIKE search
-- (origin / destination / vehicle) for clients with many lanes.
-- pg_trgm is already installed; these GIN trigram indexes let ILIKE '%term%'
-- use an index instead of scanning every lane row for the client.

CREATE INDEX IF NOT EXISTS idx_client_lane_rates_origin_label_trgm
  ON public.client_lane_rates USING gin (origin_label gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_client_lane_rates_destination_label_trgm
  ON public.client_lane_rates USING gin (destination_label gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_client_lane_rates_destination_address_trgm
  ON public.client_lane_rates USING gin (destination_address gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_client_lane_rates_vehicle_type_trgm
  ON public.client_lane_rates USING gin (vehicle_type gin_trgm_ops);
