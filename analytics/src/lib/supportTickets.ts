/**
 * Support — Admin Console data access. Runs under the signed-in admin's own
 * session (analytics/src/lib/supabaseAuth.ts), NOT the service_role client.
 *
 * Phase 1 (20270304000000_support_admin_session_auth.sql) moved Support off
 * service_role: the admin_* RPCs are now granted to `authenticated` and guarded
 * on can_manage_support()/can_view_support(), and the four support_ticket*
 * tables carry admin-read RLS policies. Two things follow that the old
 * service_role path could not give:
 *
 *   - Reads are RLS-enforced rather than RLS-bypassing, so this file no longer
 *     needs to be trusted to filter internal-only rows correctly; the database
 *     does it.
 *   - Every write records auth.uid() as the actor, so the activity trail names
 *     which admin acted instead of storing null.
 *
 * Writes still go exclusively through the admin_* RPCs -- never raw table
 * writes -- so the activity trail stays centralized.
 */
import { supabaseAuth as supabase } from '@/lib/supabaseAuth';

export type SupportTicketStatus =
  | 'open'
  | 'assigned'
  | 'in_progress'
  | 'waiting_for_user'
  | 'resolved'
  | 'closed';

export type SupportTicketPriority = 'low' | 'medium' | 'high' | 'critical';

export interface SupportTicketRow {
  id: string;
  display_id: string;
  created_by_user_id: string;
  organization_id: string | null;
  category: string;
  subject: string;
  description: string;
  status: SupportTicketStatus;
  priority: SupportTicketPriority;
  assigned_to: string | null;
  source_screen: string | null;
  trip_id: string | null;
  indent_id: string | null;
  owner_vehicle_id: string | null;
  market_bid_id: string | null;
  reporter_display_name: string | null;
  organization_name: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  closed_at: string | null;
  last_public_author_type?: 'user' | 'agent' | null;
  last_public_activity_at?: string | null;
  user_last_read_at?: string | null;
  agent_last_read_at?: string | null;
}

export interface SupportTicketCommentRow {
  id: string;
  ticket_id: string;
  author_user_id: string | null;
  author_type: 'user' | 'agent';
  body: string;
  visibility: 'public' | 'internal';
  created_at: string;
}

export interface SupportTicketActivityRow {
  id: string;
  ticket_id: string;
  actor_user_id: string | null;
  action: string;
  detail: string | null;
  created_at: string;
}

export interface SupportTicketAttachmentRow {
  id: string;
  ticket_id: string;
  comment_id: string | null;
  storage_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  uploaded_by_user_id: string;
  created_at: string;
}

const SUPPORT_ATTACHMENTS_BUCKET = 'support-ticket-attachments';

export function formatAttachmentSize(bytes: number | null): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function isImageAttachment(mimeType: string | null): boolean {
  return !!mimeType && mimeType.startsWith('image/');
}

/** Admin-read RLS (support_ticket_attachments_admin_select) scopes this to callers holding
 *  support.view/support.manage -- a non-admin session gets zero rows from the database
 *  itself rather than relying on the UI to withhold them. */
export async function fetchSupportTicketAttachments(
  ticketId: string,
): Promise<SupportTicketAttachmentRow[]> {
  const { data, error } = await supabase
    .from('support_ticket_attachments')
    .select('*')
    .eq('ticket_id', ticketId)
    .order('created_at', { ascending: true });
  if (error || !data) return [];
  return data as SupportTicketAttachmentRow[];
}

export async function getSupportAttachmentSignedUrl(storagePath: string): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(SUPPORT_ATTACHMENTS_BUCKET)
    .createSignedUrl(storagePath, 3600);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

/**
 * Signed URLs for many attachments in ONE request (Storage's createSignedUrls),
 * replacing a sequential per-file round trip.
 *
 * These are HTTP calls to the Storage API, not Postgres connections -- batching
 * them reduces request count and re-renders, and has no bearing on database
 * connection usage.
 *
 * Returns a path -> URL map; a path Storage could not sign is simply absent, so
 * the caller renders that attachment without a link rather than failing the set.
 */
export async function getSupportAttachmentSignedUrls(
  storagePaths: string[],
): Promise<Record<string, string>> {
  if (storagePaths.length === 0) return {};
  const unique = Array.from(new Set(storagePaths));
  const { data, error } = await supabase.storage
    .from(SUPPORT_ATTACHMENTS_BUCKET)
    .createSignedUrls(unique, 3600);
  if (error || !data) return {};
  const out: Record<string, string> = {};
  for (const row of data) {
    if (row.signedUrl && row.path) out[row.path] = row.signedUrl;
  }
  return out;
}

export const SUPPORT_STATUS_LABEL: Record<SupportTicketStatus, string> = {
  open: 'Open',
  assigned: 'Assigned',
  in_progress: 'In Progress',
  waiting_for_user: 'Waiting for user',
  resolved: 'Resolved',
  closed: 'Closed',
};

export const SUPPORT_STATUS_ORDER: SupportTicketStatus[] = [
  'open',
  'assigned',
  'in_progress',
  'waiting_for_user',
  'resolved',
  'closed',
];

export const SUPPORT_PRIORITY_ORDER: SupportTicketPriority[] = [
  'low',
  'medium',
  'high',
  'critical',
];

/**
 * All tickets the caller may see -- support_tickets_admin_select gates this.
 *
 * @deprecated Unbounded: selects every ticket row. Superseded by
 * fetchSupportTicketQueue() (paginated, filtered and counted server-side) and
 * fetchSupportAttentionCount() (badge only). No caller remains in the console;
 * kept as an export so nothing outside this file breaks silently.
 */
export async function fetchAllSupportTickets(): Promise<SupportTicketRow[]> {
  const { data, error } = await supabase
    .from('support_tickets')
    .select('*')
    .order('updated_at', { ascending: false });
  if (error || !data) return [];
  return data as SupportTicketRow[];
}

export interface SupportTicketQueuePage {
  rows: SupportTicketRow[];
  total: number;
  statusCounts: Partial<Record<SupportTicketStatus, number>>;
  needsAttention: number;
  limit: number;
  offset: number;
}

export interface SupportTicketQueueParams {
  search?: string | null;
  status?: SupportTicketStatus | null;
  unassignedOnly?: boolean;
  limit?: number;
  offset?: number;
}

/**
 * One page of the queue plus whole-queue aggregates, in a single round trip.
 *
 * Replaces fetchAllSupportTickets() + client-side filter/search/count. The
 * status counts and attention total deliberately describe the WHOLE queue, not
 * the returned page -- they drive the status tabs and the unread badge, which
 * would be wrong if they only counted the rows currently on screen.
 */
export async function fetchSupportTicketQueue(
  params: SupportTicketQueueParams = {},
): Promise<SupportTicketQueuePage> {
  const limit = params.limit ?? 50;
  const offset = params.offset ?? 0;
  const empty: SupportTicketQueuePage = {
    rows: [],
    total: 0,
    statusCounts: {},
    needsAttention: 0,
    limit,
    offset,
  };

  const { data, error } = await supabase.rpc('admin_list_support_tickets', {
    p_search: params.search?.trim() || null,
    p_status: params.status ?? null,
    p_unassigned_only: params.unassignedOnly ?? false,
    p_limit: limit,
    p_offset: offset,
  });
  if (error || !data) return empty;

  const payload = data as {
    rows?: SupportTicketRow[];
    total?: number;
    status_counts?: Partial<Record<SupportTicketStatus, number>>;
    needs_attention?: number;
    limit?: number;
    offset?: number;
  };
  return {
    rows: payload.rows ?? [],
    total: payload.total ?? 0,
    statusCounts: payload.status_counts ?? {},
    needsAttention: payload.needs_attention ?? 0,
    limit: payload.limit ?? limit,
    offset: payload.offset ?? offset,
  };
}

/**
 * Just the nav-badge number. Returns 0 when the caller holds no Support
 * permission (the RPC yields null there) so a permissionless admin sees no badge
 * rather than a console-wide error on a decorative element.
 */
export async function fetchSupportAttentionCount(): Promise<number> {
  const { data, error } = await supabase.rpc('admin_support_attention_count');
  if (error || typeof data !== 'number') return 0;
  return data;
}

export async function fetchSupportTicketConversation(ticketId: string): Promise<{
  comments: SupportTicketCommentRow[];
  activity: SupportTicketActivityRow[];
}> {
  const [commentsRes, activityRes] = await Promise.all([
    supabase
      .from('support_ticket_comments')
      .select('*')
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: true }),
    supabase
      .from('support_ticket_activity')
      .select('*')
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: true }),
  ]);
  return {
    comments: (commentsRes.data ?? []) as SupportTicketCommentRow[],
    activity: (activityRes.data ?? []) as SupportTicketActivityRow[],
  };
}

export async function replyToSupportTicketAsAgent(
  ticketId: string,
  body: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('admin_reply_to_support_ticket', {
    p_ticket_id: ticketId,
    p_body: body,
  });
  return { error: error?.message ?? null };
}

export async function addSupportTicketInternalNote(
  ticketId: string,
  body: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('admin_add_internal_note', {
    p_ticket_id: ticketId,
    p_body: body,
  });
  return { error: error?.message ?? null };
}

export async function changeSupportTicketStatus(
  ticketId: string,
  status: SupportTicketStatus,
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('admin_change_support_ticket_status', {
    p_ticket_id: ticketId,
    p_status: status,
  });
  return { error: error?.message ?? null };
}

export interface SupportTicketContextLabels {
  trip: string | null;
  indent: string | null;
  vehicle: string | null;
  marketBid: string | null;
}

/**
 * Human-readable labels for a ticket's related-record chips.
 *
 * Resolved server-side by admin_support_ticket_context_labels(), not by reading
 * trips/indents/owner_vehicles/market_bids from here. Those four are ordinary
 * business tables whose RLS is scoped to org membership or ownership, which a
 * platform admin does not match -- reading them on a session client would return
 * null for every chip and silently degrade to raw UUIDs. The RPC is guarded on
 * support.view and returns only these four display strings, so the admin gets
 * the label without being granted the tables.
 *
 * Never invents a label: an unresolvable record comes back null and the caller
 * falls back to showing the raw ID, exactly as before.
 */
export async function resolveSupportTicketContextLabels(
  ticket: Pick<SupportTicketRow, 'id'>,
): Promise<SupportTicketContextLabels> {
  const empty: SupportTicketContextLabels = {
    trip: null,
    indent: null,
    vehicle: null,
    marketBid: null,
  };
  const { data, error } = await supabase.rpc('admin_support_ticket_context_labels', {
    p_ticket_id: ticket.id,
  });
  if (error || !data) return empty;
  return { ...empty, ...(data as Partial<SupportTicketContextLabels>) };
}

export async function changeSupportTicketPriority(
  ticketId: string,
  priority: SupportTicketPriority,
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('admin_change_support_ticket_priority', {
    p_ticket_id: ticketId,
    p_priority: priority,
  });
  return { error: error?.message ?? null };
}

export async function markSupportTicketReadAsAgent(
  ticketId: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('admin_mark_support_ticket_read', {
    p_ticket_id: ticketId,
  });
  return { error: error?.message ?? null };
}

function activityAfterRead(
  activityAt: string | null | undefined,
  readAt: string | null | undefined,
): boolean {
  if (!activityAt) return false;
  if (!readAt) return true;
  return new Date(activityAt).getTime() > new Date(readAt).getTime();
}

/** Ticket needs admin attention (new/open user activity not yet opened). */
export function supportTicketNeedsAgentAttention(
  ticket: Pick<
    SupportTicketRow,
    | 'status'
    | 'last_public_author_type'
    | 'last_public_activity_at'
    | 'agent_last_read_at'
  >,
): boolean {
  if (ticket.status === 'resolved' || ticket.status === 'closed') return false;
  if (ticket.last_public_author_type !== 'user') return false;
  return activityAfterRead(ticket.last_public_activity_at, ticket.agent_last_read_at);
}

export function countSupportTicketsNeedingAgentAttention(tickets: SupportTicketRow[]): number {
  return tickets.reduce((n, t) => n + (supportTicketNeedsAgentAttention(t) ? 1 : 0), 0);
}

export function formatSupportUnreadBadge(count: number): string {
  if (count <= 0) return '';
  return count > 9 ? '9+' : String(count);
}
