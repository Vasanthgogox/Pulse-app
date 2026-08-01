-- Gate 2: force Branch B for one post (soft-deactivate projection; keep campaign + indent open).
-- Usage: set :post_id below, or replace the uuid literal.
-- After running: open Feed / Story as a Reach target org — card must show price + Bid CTA.

UPDATE public.posts
SET
  is_active = false,
  updated_at = now()
WHERE id = '91d27aaf-ffad-4534-9547-21936db609a8'::uuid  -- <-- replace with candidate post_id
  AND is_active = true
RETURNING id, is_active, source_indent_id, rate_offer;
