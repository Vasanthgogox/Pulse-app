-- Chat performance: add DESC composite indexes for pagination queries.
-- Both existing conv_time indexes are ASC; all app queries order DESC which causes
-- backward index scans. Dedicated DESC composites avoid the scan reversal overhead
-- and allow index-only scans for the common getMessagesByConversation pattern.

-- trip_messages: (conversation_id, created_at DESC)
-- Covers: getMessagesByConversation, embedded message selects in getConversationsByOrganization
CREATE INDEX IF NOT EXISTS idx_trip_messages_conv_created_desc
  ON public.trip_messages(conversation_id, created_at DESC);

-- network_messages: (conversation_id, created_at DESC)
-- Covers: getNetworkConversationsByOrg embedded messages + getNetworkMessagesByConversation
CREATE INDEX IF NOT EXISTS idx_network_messages_conv_created_desc
  ON public.network_messages(conversation_id, created_at DESC);

-- trip_conversations: (driver_id, last_message_at DESC) for driver chat list queries
-- Covers: getConversationsByDriverIds ORDER BY last_message_at DESC
CREATE INDEX IF NOT EXISTS idx_trip_conversations_driver_last_msg
  ON public.trip_conversations(driver_id, last_message_at DESC NULLS LAST)
  WHERE driver_id IS NOT NULL;
