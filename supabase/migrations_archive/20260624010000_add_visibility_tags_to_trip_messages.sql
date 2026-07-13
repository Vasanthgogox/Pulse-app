-- Add visibility_tags column to trip_messages.
-- get_global_app_bootstrap_v2 (20260536000000) reads m.visibility_tags directly
-- from trip_messages, but no prior migration created the column.
ALTER TABLE public.trip_messages
  ADD COLUMN IF NOT EXISTS visibility_tags jsonb DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_trip_messages_visibility_tags
  ON public.trip_messages USING gin (visibility_tags);
