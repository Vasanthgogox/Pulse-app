-- Link LOAD stories to the indent they were broadcast from (Pulse → Load Center bid counts).
-- Enables accurate "bids received" on Hire Partner cards and precise BidSheet → direct_quote sync.

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS source_indent_id uuid REFERENCES public.indents(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.posts.source_indent_id IS 'When a LOAD story is created from an indent, the indent id; used for offer counts and bid→quote sync.';

CREATE INDEX IF NOT EXISTS idx_posts_source_indent_id
  ON public.posts (source_indent_id)
  WHERE source_indent_id IS NOT NULL;

-- Network feed: expose source_indent_id to clients (post detail, BidSheet).
CREATE OR REPLACE FUNCTION public.get_network_feed(p_org_id uuid, p_limit integer DEFAULT 30, p_offset integer DEFAULT 0)
RETURNS TABLE (
  id uuid,
  organization_id uuid,
  org_name text,
  org_avatar_seed text,
  author_user_id uuid,
  type text,
  content text,
  origin text,
  destination text,
  load_date date,
  vehicle_type text,
  weight_tonnes numeric,
  rate_offer numeric,
  material text,
  expires_at timestamptz,
  is_active boolean,
  view_count integer,
  bid_count bigint,
  created_at timestamptz,
  source_indent_id uuid
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    p.id,
    p.organization_id,
    o.name AS org_name,
    NULL::text AS org_avatar_seed,
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
    p.created_at,
    p.source_indent_id
  FROM public.posts p
  JOIN public.organizations o ON o.id = p.organization_id
  LEFT JOIN (
    SELECT post_id, count(*) AS cnt FROM public.bids GROUP BY post_id
  ) b ON b.post_id = p.id
  WHERE p.is_active = true
    AND (
      p.organization_id = p_org_id
      OR p.organization_id IN (
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
