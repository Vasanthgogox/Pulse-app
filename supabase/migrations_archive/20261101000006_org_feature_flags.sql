-- org_feature_flags: per-org feature toggles managed from admin console
CREATE TABLE IF NOT EXISTS public.org_feature_flags (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  flag_id     text        NOT NULL,
  enabled     boolean     NOT NULL DEFAULT false,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, flag_id)
);

CREATE INDEX IF NOT EXISTS idx_org_feature_flags_org ON public.org_feature_flags(org_id);

-- Service role has full access; no RLS needed (admin console uses service key)
ALTER TABLE public.org_feature_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service role full access"
  ON public.org_feature_flags
  USING (true)
  WITH CHECK (true);
