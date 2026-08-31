/**
 * Support S2 — Admin Console data access. Runs under the console's existing
 * service_role client (analytics/src/lib/supabase.ts), same as every other
 * panel — explicitly interim per docs/SUPPORT_SYSTEM_PLAN.md §15 Decision A,
 * not a new access model invented for Support.
 *
 * Writes go through the four admin_* RPCs (admin_reply_to_support_ticket,
 * admin_add_internal_note, admin_change_support_ticket_status,
 * admin_change_support_ticket_priority) — never raw table writes — so the
 * activity trail stays centralized in one place instead of scattered across
 * client-side inserts. No agent identity/assignment here: that's S3.
 */
import { supabase } from '@/lib/supabase';

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

/** service_role bypasses RLS by design (see module comment) -- returns every attachment,
 *  including ones tied to internal-only comments; the UI is responsible for not surfacing
 *  those to a non-admin context, same as it already does for internal comments. */
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

/** All tickets, service_role bypasses RLS by design (see module comment). */
export async function fetchAllSupportTickets(): Promise<SupportTicketRow[]> {
  const { data, error } = await supabase
    .from('support_tickets')
    .select('*')
    .order('updated_at', { ascending: false });
  if (error || !data) return [];
  return data as SupportTicketRow[];
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
 * Human-readable labels for a ticket's related-record chips, resolved by ID.
 * Never invents a label -- a record that can't be resolved (deleted, RLS-
 * irrelevant since service_role bypasses it anyway, or just not found) comes
 * back null, and the caller falls back to showing the raw ID as before.
 */
export async function resolveSupportTicketContextLabels(
  ticket: Pick<SupportTicketRow, 'trip_id' | 'indent_id' | 'owner_vehicle_id' | 'market_bid_id'>,
): Promise<SupportTicketContextLabels> {
  const [tripRes, indentRes, vehicleRes, bidRes] = await Promise.all([
    ticket.trip_id
      ? supabase.from('trips').select('pickup_area,drop_location').eq('id', ticket.trip_id).maybeSingle()
      : Promise.resolve({ data: null }),
    ticket.indent_id
      ? supabase
          .from('indents')
          .select('indent_number,display_indent_id')
          .eq('id', ticket.indent_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    ticket.owner_vehicle_id
      ? supabase.from('owner_vehicles').select('vehicle_number').eq('id', ticket.owner_vehicle_id).maybeSingle()
      : Promise.resolve({ data: null }),
    ticket.market_bid_id
      ? supabase.from('market_bids').select('amount').eq('id', ticket.market_bid_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const trip = tripRes.data as { pickup_area: string | null; drop_location: string | null } | null;
  const indent = indentRes.data as { indent_number: string | null; display_indent_id: string | null } | null;
  const vehicle = vehicleRes.data as { vehicle_number: string | null } | null;
  const bid = bidRes.data as { amount: number | null } | null;

  return {
    trip: trip && (trip.pickup_area || trip.drop_location)
      ? `${trip.pickup_area?.trim() || 'Pickup'} → ${trip.drop_location?.trim() || 'Drop'}`
      : null,
    indent: indent ? (indent.display_indent_id || indent.indent_number) : null,
    vehicle: vehicle?.vehicle_number ?? null,
    marketBid: bid?.amount != null ? `₹${Number(bid.amount).toLocaleString('en-IN')}` : null,
  };
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
