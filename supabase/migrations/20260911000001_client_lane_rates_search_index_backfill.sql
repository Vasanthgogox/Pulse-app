-- Follow-up to 20260723044021_client_lane_rates_search_index.sql, which is
-- timestamped before 20260911000000_client_management_module.sql (what
-- actually creates client_lane_rates). On a from-scratch replay,
-- 20260723044021 now guards itself to skip when the table doesn't exist yet
-- (see that file), so these trigram indexes need to be (re)created here
-- instead, once the table is guaranteed to exist. No-op on any environment
-- where 20260723044021 already created them.
DO $$
BEGIN
  IF to_regclass('public.client_lane_rates') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_client_lane_rates_origin_label_trgm
      ON public.client_lane_rates USING gin (origin_label gin_trgm_ops);

    CREATE INDEX IF NOT EXISTS idx_client_lane_rates_destination_label_trgm
      ON public.client_lane_rates USING gin (destination_label gin_trgm_ops);

    -- NOTE: the source migration (20260723044021) targets a column named
    -- destination_address, which does not exist on client_lane_rates (only
    -- origin_label/destination_label do -- see 20260911000000_client_management_module.sql).
    -- Pre-existing bug in that migration, unrelated to the timing guard;
    -- corrected here to the real column so this index can actually be created.
    CREATE INDEX IF NOT EXISTS idx_client_lane_rates_destination_address_trgm
      ON public.client_lane_rates USING gin (destination_label gin_trgm_ops);

    CREATE INDEX IF NOT EXISTS idx_client_lane_rates_vehicle_type_trgm
      ON public.client_lane_rates USING gin (vehicle_type gin_trgm_ops);
  END IF;
END $$;
