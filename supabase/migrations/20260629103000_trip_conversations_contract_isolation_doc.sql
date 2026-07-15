-- Contractual lane isolation (documentation)
-- trip_conversations is UNIQUE (trip_id, party_type): each primary trip exposes at most
-- one client lane, one supplier lane, and one driver lane. Sub-contract / secondary
-- carrier flows must use a separate trip_id (new conversation set) so upstream Party A
-- never shares a conversation_id with downstream-only threads. RLS on trip_messages
-- already scopes rows by organization_id and conversation membership via existing policies.

COMMENT ON TABLE public.trip_conversations IS
  'One commercial/operational lane per (trip_id, party_type). Sub-contract work must use a new trip_id so Party A is not a participant in Party B↔C threads; trip_messages RLS ties reads to org + conversation.';
