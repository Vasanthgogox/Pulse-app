-- Gate 2: restore post after Branch B QA (re-activate projection).

UPDATE public.posts
SET
  is_active = true,
  updated_at = now()
WHERE id = '91d27aaf-ffad-4534-9547-21936db609a8'::uuid  -- <-- same post_id as force script
  AND is_active = false
RETURNING id, is_active, source_indent_id;
