-- Ratings: Client → Supplier, Supplier → Driver (no reverse).
-- Copy this migration to Q-unified-base supabase/migrations/ and run there.
-- Table: one row per rating (trip-scoped); unique per (trip, rater, rated).

CREATE TABLE IF NOT EXISTS public.ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  rater_type text NOT NULL CHECK (rater_type IN ('client', 'supplier', 'organization')),
  rater_id uuid NOT NULL,
  rated_type text NOT NULL CHECK (rated_type IN ('supplier', 'driver')),
  rated_id uuid NOT NULL,
  score smallint NOT NULL CHECK (score >= 1 AND score <= 5),
  comment text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE (trip_id, rater_type, rater_id, rated_type, rated_id)
);

COMMENT ON TABLE public.ratings IS 'Trip-scoped ratings: Client→Supplier, Supplier→Driver only.';
COMMENT ON COLUMN public.ratings.rater_type IS 'client = client rates supplier; supplier = supplier rates driver; organization = fleet rates own driver (asset trip).';
COMMENT ON COLUMN public.ratings.rated_type IS 'supplier when rater is client; driver when rater is supplier.';

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

-- If ratings table already exists with old rater_type check, run this to allow 'organization':
-- ALTER TABLE public.ratings DROP CONSTRAINT IF EXISTS ratings_rater_type_check;
-- ALTER TABLE public.ratings ADD CONSTRAINT ratings_rater_type_check
--   CHECK (rater_type IN ('client', 'supplier', 'organization'));
