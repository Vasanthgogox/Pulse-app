-- ─────────────────────────────────────────────────────────────────────────────
-- get_b2b_chat_bootstrap — canonical one-shot bootstrap RPC
--
-- The frontend calls this once per org-session on ChatScreen mount.
-- After that, all state updates arrive exclusively via Realtime WebSocket.
-- No follow-up fetches, no hydrateConversationById, no polling.
--
-- Returns the same shape as get_initial_chat_state (50 messages per conv)
-- plus all three party-type conversations for every active trip, so the
-- multi-party tab switcher can work with zero DB calls on tab press.
--
-- Thin alias over get_whatsapp_bootstrap_data (20260532000000).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_b2b_chat_bootstrap(
  p_organization_id UUID,
  p_message_limit   INT DEFAULT 50
)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.get_whatsapp_bootstrap_data(p_organization_id, p_message_limit);
$$;

REVOKE ALL    ON FUNCTION public.get_b2b_chat_bootstrap(UUID, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_b2b_chat_bootstrap(UUID, INT) TO authenticated;

COMMENT ON FUNCTION public.get_b2b_chat_bootstrap IS
  '"Bootstrap & Patch" entry point. One DB call on app start; all subsequent '
  'updates arrive via Realtime. Returns last 50 messages per conversation '
  'plus full trip metadata for every active non-cancelled trip conversation.';
