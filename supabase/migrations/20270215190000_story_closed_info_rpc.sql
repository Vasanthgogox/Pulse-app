-- Fix: story-detail "closed" reason always collapsed to the generic fallback
-- for any viewer outside the post's own org.
--
-- getStoryClosedInfo() (features/network/services/posts.service.ts) explains
-- *why* a story link is dead — assigned / withdrawn / expired / closed — by
-- reading posts/indents directly via the client. But posts_select_authenticated
-- only allows a direct SELECT when posts.is_active = true OR the caller is a
-- member of the post's own org. The exact moment a story needs this
-- explanation (is_active turned false) is the same moment RLS starts hiding
-- the row from everyone else. Every cross-org viewer's raw select returned
-- nothing, so the four specific reasons were unreachable in production and
-- every closed story showed the generic "This broadcast is no longer
-- available" copy regardless of the real reason.
--
-- Fix: expose the same lookup through a SECURITY DEFINER RPC, mirroring
-- get_story_preview (20270128104000) — same non-sensitive fields, same
-- public-callable pattern for anonymous share-link viewers.

CREATE OR REPLACE FUNCTION public.get_story_closed_info(p_post_id uuid)
RETURNS TABLE(reason text, indent_status text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_is_active boolean;
  v_source_indent_id uuid;
  v_status text;
BEGIN
  SELECT p.is_active, p.source_indent_id
  INTO v_is_active, v_source_indent_id
  FROM public.posts p
  WHERE p.id = p_post_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'removed'::text, NULL::text;
    RETURN;
  END IF;

  IF v_source_indent_id IS NOT NULL THEN
    SELECT lower(trim(coalesce(i.status::text, '')))
    INTO v_status
    FROM public.indents i
    WHERE i.id = v_source_indent_id;

    IF v_status IN ('awarded', 'assigned', 'deployed', 'completed') THEN
      RETURN QUERY SELECT 'assigned'::text, v_status;
      RETURN;
    ELSIF v_status = 'cancelled' THEN
      RETURN QUERY SELECT 'withdrawn'::text, v_status;
      RETURN;
    ELSIF v_status IN ('expired', 'closed') THEN
      RETURN QUERY SELECT 'expired'::text, v_status;
      RETURN;
    ELSIF v_is_active IS FALSE THEN
      RETURN QUERY SELECT 'closed'::text, v_status;
      RETURN;
    END IF;

    -- Indent still open for bids — posts.expires_at must not invent a close reason.
    RETURN QUERY SELECT 'removed'::text, v_status;
    RETURN;
  END IF;

  IF v_is_active IS FALSE THEN
    RETURN QUERY SELECT 'closed'::text, NULL::text;
    RETURN;
  END IF;

  RETURN QUERY SELECT 'removed'::text, NULL::text;
END;
$function$;

COMMENT ON FUNCTION public.get_story_closed_info(uuid) IS
  'Why a shared story link is dead (assigned/withdrawn/expired/closed/removed). SECURITY DEFINER so the reason is visible after posts_select_authenticated would otherwise hide the row (is_active=false + caller not in the post''s org) — same public-callable pattern as get_story_preview.';
