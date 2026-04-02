-- Add optional weight column to indents (kg).
-- Used when creating indents for load specifications.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'indents' AND column_name = 'weight'
  ) THEN
    ALTER TABLE public.indents ADD COLUMN weight numeric(12,2);
    COMMENT ON COLUMN public.indents.weight IS 'Load weight in kg (optional).';
  END IF;
END $$;
