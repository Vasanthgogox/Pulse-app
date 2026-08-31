import {
  countSupportTicketsWithAgentUpdate,
  countSupportTicketsWithUserUpdate,
  formatSupportUnreadBadge,
  supportTicketHasAgentUpdate,
  supportTicketHasUserUpdate,
} from '@/features/support/utils/supportTicketUnread.util';

describe('supportTicketUnread', () => {
  const base = {
    status: 'open',
    last_public_author_type: 'user' as const,
    last_public_activity_at: '2026-08-31T10:00:00.000Z',
    user_last_read_at: '2026-08-31T10:00:00.000Z',
    agent_last_read_at: null as string | null,
  };

  it('flags user update when agent wrote after user last read', () => {
    expect(
      supportTicketHasUserUpdate({
        ...base,
        last_public_author_type: 'agent',
        last_public_activity_at: '2026-08-31T12:00:00.000Z',
        user_last_read_at: '2026-08-31T10:00:00.000Z',
      }),
    ).toBe(true);
  });

  it('does not flag user update when user already read', () => {
    expect(
      supportTicketHasUserUpdate({
        ...base,
        last_public_author_type: 'agent',
        last_public_activity_at: '2026-08-31T12:00:00.000Z',
        user_last_read_at: '2026-08-31T12:00:00.000Z',
      }),
    ).toBe(false);
  });

  it('flags agent update for unread user activity', () => {
    expect(supportTicketHasAgentUpdate(base)).toBe(true);
  });

  it('ignores resolved tickets for agent inbox badge', () => {
    expect(supportTicketHasAgentUpdate({ ...base, status: 'resolved' })).toBe(false);
  });

  it('counts and formats badges', () => {
    const tickets = [
      base,
      {
        ...base,
        last_public_author_type: 'agent' as const,
        user_last_read_at: null,
      },
    ];
    expect(countSupportTicketsWithAgentUpdate(tickets)).toBe(1);
    expect(countSupportTicketsWithUserUpdate(tickets)).toBe(1);
    expect(formatSupportUnreadBadge(12)).toBe('9+');
  });
});
