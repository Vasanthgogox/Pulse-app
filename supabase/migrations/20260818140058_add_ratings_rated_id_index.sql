-- get_connection_partner_display / get_connection_partner_display_batch (network
-- profile modal stats) filter ratings by `rated_id = X OR rated_id IN (...)` with
-- no rated_type predicate. The only existing index, idx_ratings_rated_org, leads
-- with rated_type, so it can't be used and Postgres falls back to a sequential
-- scan of the whole ratings table on every profile-modal open.
CREATE INDEX IF NOT EXISTS idx_ratings_rated_id
  ON public.ratings USING btree (rated_id);
