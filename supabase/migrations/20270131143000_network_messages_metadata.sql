-- Store optional message metadata (e.g. WhatsApp-style "replied to story" preview).
ALTER TABLE public.network_messages
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.network_messages.metadata IS
  'Extensible payload. Story reply uses { reply_to_story: { post_id, story_type, title, route, owner_name } }.';
