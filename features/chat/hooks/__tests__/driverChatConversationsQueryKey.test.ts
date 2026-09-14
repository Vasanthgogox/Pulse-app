import { queryKeys } from '@/lib/queryKeys';

/**
 * Inbox list is owned by useDriverChatConversationsQuery, which uses this key.
 * DriverChatProvider no longer also calls preloadDriverChatConversations on mount.
 */
describe('driver chat inbox query key', () => {
  it('is stable and scoped by sorted driver-id key', () => {
    expect(queryKeys.driverChat.conversations('a,b')).toEqual([
      'q',
      'driver-chat',
      'conversations',
      'a,b',
    ]);
  });
});
