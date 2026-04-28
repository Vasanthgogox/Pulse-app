-- Network Social Layer — posts, bids, note on connection_requests
-- Run: npm run db:push

-- ───────────────────────────────────────────────
-- 1. Add note column to connection_requests
-- ───────────────────────────────────────────────
ALTER TABLE public.connection_requests
  ADD COLUMN IF NOT EXISTS note TEXT;

-- ───────────────────────────────────────────────
-- 2. posts table
-- ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.posts (
  id                UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id   UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  author_user_id    UUID        NOT NULL REFERENCES auth.users(id),
  type              TEXT        NOT NULL CHECK (type IN ('UPDATE', 'LOAD')),
  content           TEXT,
  -- Load-specific columns (nullable for UPDATE posts)
  origin            TEXT,
  destination       TEXT,
  load_date         DATE,
  vehicle_type      TEXT,
  weight_tonnes     NUMERIC,
  rate_offer        NUMERIC,
  material          TEXT,
  -- Lifecycle
  expires_at        TIMESTAMPTZ,
  is_active         BOOLEAN     NOT NULL DEFAULT true,
  view_count        INTEGER     NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_posts_org        ON public.posts(organization_id);
CREATE INDEX IF NOT EXISTS idx_posts_created_at ON public.posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_active     ON public.posts(is_active) WHERE is_active = true;

-- ───────────────────────────────────────────────
-- 3. bids table
-- ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.bids (
  id                       UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id                  UUID        NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  bidder_organization_id   UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  bidder_user_id           UUID        NOT NULL REFERENCES auth.users(id),
  amount                   NUMERIC     NOT NULL,
  note                     TEXT,
  status                   TEXT        NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending', 'accepted', 'rejected', 'withdrawn')),
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(post_id, bidder_organization_id)
);

CREATE INDEX IF NOT EXISTS idx_bids_post_id ON public.bids(post_id);
CREATE INDEX IF NOT EXISTS idx_bids_bidder  ON public.bids(bidder_organization_id);

-- ───────────────────────────────────────────────
-- 4. updated_at triggers
-- ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_posts_updated_at ON public.posts;
CREATE TRIGGER trg_posts_updated_at
  BEFORE UPDATE ON public.posts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_bids_updated_at ON public.bids;
CREATE TRIGGER trg_bids_updated_at
  BEFORE UPDATE ON public.bids
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ───────────────────────────────────────────────
-- 5. RLS
-- ───────────────────────────────────────────────
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bids  ENABLE ROW LEVEL SECURITY;

-- Re-runnable safety for environments where policies already exist.
DROP POLICY IF EXISTS "posts_select" ON public.posts;
DROP POLICY IF EXISTS "posts_insert" ON public.posts;
DROP POLICY IF EXISTS "posts_update" ON public.posts;
DROP POLICY IF EXISTS "bids_select" ON public.bids;
DROP POLICY IF EXISTS "bids_insert" ON public.bids;
DROP POLICY IF EXISTS "bids_update" ON public.bids;

-- Posts: org members can read their own org's posts + all active posts
CREATE POLICY "posts_select" ON public.posts
  FOR SELECT USING (is_active = true);

-- Posts: org members can insert posts for their own org
CREATE POLICY "posts_insert" ON public.posts
  FOR INSERT WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid()
    )
  );

-- Posts: org members can update/deactivate their own org's posts
CREATE POLICY "posts_update" ON public.posts
  FOR UPDATE USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid()
    )
  );

-- Bids: anyone can read bids on active posts
CREATE POLICY "bids_select" ON public.bids
  FOR SELECT USING (true);

-- Bids: org members can insert bids on behalf of their org
CREATE POLICY "bids_insert" ON public.bids
  FOR INSERT WITH CHECK (
    bidder_organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid()
    )
  );

-- Bids: org members can update their own org's bids (withdraw); post owner can accept/reject
CREATE POLICY "bids_update" ON public.bids
  FOR UPDATE USING (
    bidder_organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid()
    )
    OR
    post_id IN (
      SELECT p.id FROM public.posts p
      JOIN public.organization_members om ON om.organization_id = p.organization_id
      WHERE om.user_id = auth.uid()
    )
  );

-- ───────────────────────────────────────────────
-- 6. RPC: get_network_feed — posts from your org + connected orgs
-- ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_network_feed(p_org_id UUID, p_limit INT DEFAULT 30, p_offset INT DEFAULT 0)
RETURNS TABLE (
  id               UUID,
  organization_id  UUID,
  org_name         TEXT,
  org_avatar_seed  TEXT,
  author_user_id   UUID,
  type             TEXT,
  content          TEXT,
  origin           TEXT,
  destination      TEXT,
  load_date        DATE,
  vehicle_type     TEXT,
  weight_tonnes    NUMERIC,
  rate_offer       NUMERIC,
  material         TEXT,
  expires_at       TIMESTAMPTZ,
  is_active        BOOLEAN,
  view_count       INTEGER,
  bid_count        BIGINT,
  created_at       TIMESTAMPTZ
)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT
    p.id,
    p.organization_id,
    o.name            AS org_name,
    NULL::TEXT        AS org_avatar_seed,
    p.author_user_id,
    p.type,
    p.content,
    p.origin,
    p.destination,
    p.load_date,
    p.vehicle_type,
    p.weight_tonnes,
    p.rate_offer,
    p.material,
    p.expires_at,
    p.is_active,
    p.view_count,
    COALESCE(b.cnt, 0) AS bid_count,
    p.created_at
  FROM public.posts p
  JOIN public.organizations o ON o.id = p.organization_id
  LEFT JOIN (
    SELECT post_id, COUNT(*) AS cnt FROM public.bids GROUP BY post_id
  ) b ON b.post_id = p.id
  WHERE p.is_active = true
    AND (
      p.organization_id = p_org_id
      OR p.organization_id IN (
        -- approved connected orgs (both directions)
        SELECT cr.to_organization_id
        FROM public.connection_requests cr
        WHERE cr.from_organization_id = p_org_id AND cr.status = 'approved'
        UNION
        SELECT cr.from_organization_id
        FROM public.connection_requests cr
        WHERE cr.to_organization_id = p_org_id AND cr.status = 'approved'
      )
    )
  ORDER BY p.created_at DESC
  LIMIT p_limit OFFSET p_offset;
$$;

-- ───────────────────────────────────────────────
-- 7. RPC: discover_organizations — find orgs not yet connected
-- ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.discover_organizations(
  p_org_id   UUID,
  p_search   TEXT DEFAULT '',
  p_limit    INT  DEFAULT 20,
  p_offset   INT  DEFAULT 0
)
RETURNS TABLE (
  id                   UUID,
  name                 TEXT,
  avatar_seed          TEXT,
  connection_status    TEXT
)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT
    o.id,
    o.name,
    NULL::TEXT         AS avatar_seed,
    COALESCE(cr.status, 'none') AS connection_status
  FROM public.organizations o
  LEFT JOIN public.connection_requests cr ON (
    (cr.from_organization_id = p_org_id AND cr.to_organization_id = o.id)
    OR
    (cr.to_organization_id = p_org_id AND cr.from_organization_id = o.id)
  )
  WHERE o.id <> p_org_id
    AND (p_search = '' OR o.name ILIKE '%' || p_search || '%')
  ORDER BY
    CASE COALESCE(cr.status, 'none')
      WHEN 'approved' THEN 1
      WHEN 'pending'  THEN 2
      ELSE 3
    END,
    o.name ASC
  LIMIT p_limit OFFSET p_offset;
$$;
