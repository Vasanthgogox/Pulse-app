-- Ratings: Client → Supplier, Supplier → Driver; organization can rate driver (asset trips).
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

COMMENT ON TABLE public.ratings IS 'Trip-scoped ratings: Client→Supplier, Supplier→Driver; organization rates driver on asset trips.';
COMMENT ON COLUMN public.ratings.rater_type IS 'client = client rates supplier; supplier = supplier rates driver; organization = fleet rates own driver (asset trip).';
COMMENT ON COLUMN public.ratings.rated_type IS 'supplier when rater is client; driver when rater is supplier or organization.';

CREATE INDEX IF NOT EXISTS idx_ratings_organization_id ON public.ratings(organization_id);
CREATE INDEX IF NOT EXISTS idx_ratings_trip_id ON public.ratings(trip_id);
CREATE INDEX IF NOT EXISTS idx_ratings_rated ON public.ratings(rated_type, rated_id);
CREATE INDEX IF NOT EXISTS idx_ratings_created_at ON public.ratings(created_at DESC);

ALTER TABLE public.ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage ratings in their org"
  ON public.ratings
  FOR ALL
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ratings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ratings TO anon;
GRANT EXECUTE ON FUNCTION public.is_org_member(uuid) TO anon;
