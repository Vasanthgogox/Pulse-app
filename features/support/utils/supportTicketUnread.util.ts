/**
 * Unread / "update available" for support tickets.
 * Relies on last_public_* + *_last_read_at from migration 20270303030000.
 */
export type SupportTicketUnreadFields = {
  status: string;
  last_public_author_type?: 'user' | 'agent' | null;
  last_public_activity_at?: string | null;
  user_last_read_at?: string | null;
  agent_last_read_at?: string | null;
};

function activityAfterRead(
  activityAt: string | null | undefined,
  readAt: string | null | undefined,
): boolean {
  if (!activityAt) return false;
  if (!readAt) return true;
  return new Date(activityAt).getTime() > new Date(readAt).getTime();
}

/** Pulse user: Support (or waiting_for_user) left something you have not opened yet. */
export function supportTicketHasUserUpdate(ticket: SupportTicketUnreadFields): boolean {
  if (ticket.last_public_author_type !== 'agent') return false;
  return activityAfterRead(ticket.last_public_activity_at, ticket.user_last_read_at);
}

/** Admin: reporter left something (or a new open ticket) you have not opened yet. */
export function supportTicketHasAgentUpdate(ticket: SupportTicketUnreadFields): boolean {
  if (ticket.status === 'resolved' || ticket.status === 'closed') return false;
  if (ticket.last_public_author_type !== 'user') return false;
  return activityAfterRead(ticket.last_public_activity_at, ticket.agent_last_read_at);
}

export function countSupportTicketsWithUserUpdate(
  tickets: SupportTicketUnreadFields[],
): number {
  return tickets.reduce((n, t) => n + (supportTicketHasUserUpdate(t) ? 1 : 0), 0);
}

export function countSupportTicketsWithAgentUpdate(
  tickets: SupportTicketUnreadFields[],
): number {
  return tickets.reduce((n, t) => n + (supportTicketHasAgentUpdate(t) ? 1 : 0), 0);
}

export function formatSupportUnreadBadge(count: number): string {
  if (count <= 0) return '';
  return count > 9 ? '9+' : String(count);
}
