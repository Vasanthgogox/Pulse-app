-- fn_post_trip_room_action_card was defined twice:
--   (uuid, text, text, text, jsonb, uuid)           ← 20260918, 6-param original
--   (uuid, text, text, text, jsonb, uuid, timestamptz) ← 20260919+, 7-param with defaults
-- Calling with 6 args matches both → "function is not unique" → PostgREST introspection error → DB instability.
-- Drop the old 6-param overload; all callers now use the 7-param version (last param defaults to NULL).

DROP FUNCTION IF EXISTS public.fn_post_trip_room_action_card(uuid, text, text, text, jsonb, uuid);
