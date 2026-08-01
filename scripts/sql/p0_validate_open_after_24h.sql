SELECT p.id::text AS post_id,
       left(coalesce(i.indent_number, p.id::text), 16) AS indent,
       i.status,
       round(extract(epoch from (now()-p.created_at))/3600.0, 1) AS age_hrs,
       (p.expires_at IS NOT NULL AND p.expires_at < now()) AS past_expires,
       (p.rate_offer IS NOT NULL) AS has_price,
       public.indent_open_for_marketplace_bids(p.source_indent_id) AS visible_backend
FROM public.posts p
JOIN public.indents i ON i.id = p.source_indent_id
WHERE upper(coalesce(p.type,''))='LOAD'
  AND public.indent_open_for_marketplace_bids(p.source_indent_id)
  AND p.created_at + interval '24 hours' < now()
ORDER BY p.created_at ASC
LIMIT 10;
