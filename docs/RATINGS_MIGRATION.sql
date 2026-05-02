-- Ratings: trip-scoped rows (Client→Supplier, Supplier→Driver, Org→Driver, Supplier/Org→Client).
-- Copy to Q-unified-base supabase/migrations/ and run there.
-- Existing DBs without rated_type client: run supabase/migrations/20260503100000_ratings_add_client_rated_type.sql.

CREATE TABLE IF NOT EXISTS public.ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  rater_type text NOT NULL CHECK (rater_type IN ('client', 'supplier', 'organization')),
  rater_id uuid NOT NULL,
  rated_type text NOT NULL CHECK (rated_type IN ('supplier', 'driver', 'client')),
  rated_id uuid NOT NULL,
  score smallint NOT NULL CHECK (score >= 1 AND score <= 5),
  comment text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE (trip_id, rater_type, rater_id, rated_type, rated_id)
);

COMMENT ON TABLE public.ratings IS 'Trip-scoped ratings: parties score each other on a trip.';
COMMENT ON COLUMN public.ratings.rater_type IS 'client | supplier | organization (who gives the score).';
COMMENT ON COLUMN public.ratings.rated_type IS 'supplier | driver | client (who is scored).';

CREATE INDEX IF NOT EXISTS idx_ratings_organization_id ON public.ratings(organization_id);
CREATE INDEX IF NOT EXISTS idx_ratings_trip_id ON public.ratings(trip_id);
CREATE INDEX IF NOT EXISTS idx_ratings_rated ON public.ratings(rated_type, rated_id);
CREATE INDEX IF NOT EXISTS idx_ratings_created_at ON public.ratings(created_at DESC);

ALTER TABLE public.ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage ratings in their org"
  ON public.ratings
  FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid()
    )
  );

-- If ratings table already exists with old CHECKs, run these (or use migration files in supabase/migrations/):
-- ALTER TABLE public.ratings DROP CONSTRAINT IF EXISTS ratings_rater_type_check;
-- ALTER TABLE public.ratings ADD CONSTRAINT ratings_rater_type_check
--   CHECK (rater_type IN ('client', 'supplier', 'organization'));
-- ALTER TABLE public.ratings DROP CONSTRAINT IF EXISTS ratings_rated_type_check;
-- ALTER TABLE public.ratings ADD CONSTRAINT ratings_rated_type_check
--   CHECK (rated_type IN ('supplier', 'driver', 'client'));
