/**
 * Support S1 — user-facing ticket creation/reply, via the reviewed
 * submit_support_ticket/reply_to_support_ticket RPCs only. No raw table
 * writes: RLS on support_tickets/support_ticket_comments has no INSERT/UPDATE
 * policy for authenticated, by design (see supabase/migrations/20270302000000).
 *
 * Attachments (added later, see 20270303010000): storage.objects write path is
 * gated by Storage RLS (folder-scoped to the uploader's own auth.uid()), and the
 * support_ticket_attachments row is written only via record_support_ticket_attachment
 * -- no raw table write here either.
 *
 * Attachment limits below are client-side UX guardrails only -- the DB/storage layer
 * (supabase/migrations/20270303010000_support_ticket_attachments_upload.sql) is the
 * authoritative enforcement and does not read these constants. SQL and TS can't share
 * a literal across the network boundary, so keep these two files in sync by hand:
 *   - SUPPORT_ATTACHMENT_MAX_BYTES        <-> storage.buckets.file_size_limit
 *   - SUPPORT_ATTACHMENT_ALLOWED_MIME_TYPES <-> storage.buckets.allowed_mime_types
 *   - SUPPORT_ATTACHMENT_MAX_PER_TICKET   <-> record_support_ticket_attachment's
 *                                              v_existing_count >= 10 check
 * If any of these change, update both this file and that migration together.
 */
import { supabase } from '@/lib/supabase';
import { uuidv7 } from '@/lib/uuidv7';

const SUPPORT_ATTACHMENTS_BUCKET = 'support-ticket-attachments';
export const SUPPORT_ATTACHMENT_MAX_BYTES = 15 * 1024 * 1024;
export const SUPPORT_ATTACHMENT_ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'application/pdf',
];
/** Per Create Ticket submission -- UX guardrail only, not server-enforced. */
export const SUPPORT_ATTACHMENT_MAX_PER_UPLOAD = 5;
/** Mirrors record_support_ticket_attachment's server-side, authoritative cap. */
export const SUPPORT_ATTACHMENT_MAX_PER_TICKET = 10;

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
  source_screen: string | null;
  trip_id: string | null;
  indent_id: string | null;
  owner_vehicle_id: string | null;
  market_bid_id: string | null;
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
  author_type?: 'user' | 'agent';
  body: string;
  visibility: 'public' | 'internal';
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

/** Lightweight attachment fields for My Tickets list preview. */
export type SupportTicketAttachmentPreview = Pick<
  SupportTicketAttachmentRow,
  'id' | 'storage_path' | 'mime_type' | 'size_bytes' | 'created_at'
>;

export type SupportTicketListItem = SupportTicketRow & {
  attachments: SupportTicketAttachmentPreview[];
};

export function formatAttachmentSize(bytes: number | null): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function isImageAttachment(mimeType: string | null): boolean {
  return !!mimeType && mimeType.startsWith('image/');
}

/** Client-controlled category list for S1 — no DB-level enum yet (see plan doc §"free-text category"). */
export const SUPPORT_TICKET_CATEGORIES = [
  'Payment',
  'Trip',
  'Account',
  'Technical',
  'Other',
] as const;
export type SupportTicketCategory = (typeof SUPPORT_TICKET_CATEGORIES)[number];

export function supportTicketStatusLabel(status: SupportTicketStatus): string {
  switch (status) {
    case 'open':
      return 'Open';
    case 'assigned':
      return 'Assigned';
    case 'in_progress':
      return 'In Progress';
    case 'waiting_for_user':
      return 'Waiting for you';
    case 'resolved':
      return 'Resolved';
    case 'closed':
      return 'Closed';
  }
}

export function isSupportTicketClosed(status: SupportTicketStatus): boolean {
  return status === 'closed';
}

export interface SubmitSupportTicketParams {
  category: string;
  subject: string;
  description: string;
  organizationId?: string | null;
  tripId?: string | null;
  indentId?: string | null;
  ownerVehicleId?: string | null;
  marketBidId?: string | null;
  sourceScreen?: string | null;
}

export async function submitSupportTicket(
  params: SubmitSupportTicketParams,
): Promise<{ ticketId: string; displayId: string } | { error: Error }> {
  const { data, error } = await supabase().rpc('submit_support_ticket', {
    p_category: params.category,
    p_subject: params.subject,
    p_description: params.description,
    p_organization_id: params.organizationId ?? null,
    p_trip_id: params.tripId ?? null,
    p_indent_id: params.indentId ?? null,
    p_owner_vehicle_id: params.ownerVehicleId ?? null,
    p_market_bid_id: params.marketBidId ?? null,
    p_source_screen: params.sourceScreen ?? null,
  });
  if (error) return { error: new Error(error.message) };
  const result = data as { ticket_id: string; display_id: string };
  return { ticketId: result.ticket_id, displayId: result.display_id };
}

export async function replyToSupportTicket(
  ticketId: string,
  body: string,
): Promise<{ commentId: string } | { error: Error }> {
  const { data, error } = await supabase().rpc('reply_to_support_ticket', {
    p_ticket_id: ticketId,
    p_body: body,
  });
  if (error) return { error: new Error(error.message) };
  const result = data as { comment_id: string };
  return { commentId: result.comment_id };
}

/** Clears the user's unread / update-available flag for this ticket. */
export async function markSupportTicketReadByUser(
  ticketId: string,
): Promise<{ ok: true } | { error: Error }> {
  const { error } = await supabase().rpc('mark_support_ticket_read_by_user', {
    p_ticket_id: ticketId,
  });
  if (error) return { error: new Error(error.message) };
  return { ok: true };
}

export async function fetchMySupportTickets(
  uid: string,
): Promise<{ tickets: SupportTicketListItem[] } | { error: Error }> {
  const { data, error } = await supabase()
    .from('support_tickets')
    .select(
      `
      *,
      support_ticket_attachments (
        id,
        storage_path,
        mime_type,
        size_bytes,
        created_at
      )
    `,
    )
    .eq('created_by_user_id', uid)
    .order('updated_at', { ascending: false });
  if (error) return { error: new Error(error.message) };

  const tickets: SupportTicketListItem[] = ((data ?? []) as Array<
    SupportTicketRow & {
      support_ticket_attachments?: SupportTicketAttachmentPreview[] | null;
    }
  >).map((row) => {
    const { support_ticket_attachments, ...ticket } = row;
    const attachments = [...(support_ticket_attachments ?? [])].sort((a, b) =>
      String(a.created_at ?? '').localeCompare(String(b.created_at ?? '')),
    );
    return {
      ...(ticket as SupportTicketRow),
      attachments,
    };
  });

  return { tickets };
}

export async function fetchSupportTicketDetail(
  ticketId: string,
): Promise<
  | {
      ticket: SupportTicketRow;
      comments: SupportTicketCommentRow[];
      attachments: SupportTicketAttachmentRow[];
    }
  | { error: Error }
> {
  const [ticketRes, commentsRes, attachmentsRes] = await Promise.all([
    supabase().from('support_tickets').select('*').eq('id', ticketId).maybeSingle(),
    supabase()
      .from('support_ticket_comments')
      .select('*')
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: true }),
    supabase()
      .from('support_ticket_attachments')
      .select('*')
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: true }),
  ]);
  if (ticketRes.error) return { error: new Error(ticketRes.error.message) };
  if (!ticketRes.data) return { error: new Error('Ticket not found') };
  if (commentsRes.error) return { error: new Error(commentsRes.error.message) };
  if (attachmentsRes.error) return { error: new Error(attachmentsRes.error.message) };
  return {
    ticket: ticketRes.data as SupportTicketRow,
    comments: (commentsRes.data ?? []) as SupportTicketCommentRow[],
    attachments: (attachmentsRes.data ?? []) as SupportTicketAttachmentRow[],
  };
}

export interface StagedSupportAttachment {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  arrayBuffer: ArrayBuffer;
}

export function validateSupportAttachment(file: StagedSupportAttachment): string | null {
  if (file.sizeBytes > SUPPORT_ATTACHMENT_MAX_BYTES) {
    return `${file.fileName} is too large (max ${formatAttachmentSize(SUPPORT_ATTACHMENT_MAX_BYTES)}).`;
  }
  if (!SUPPORT_ATTACHMENT_ALLOWED_MIME_TYPES.includes(file.mimeType)) {
    return `${file.fileName} is not a supported file type.`;
  }
  return null;
}

/**
 * Upload one already-picked file to Storage, then record it via the
 * record_support_ticket_attachment RPC. Called only after the ticket (or comment) it
 * belongs to already exists -- a failed upload never leaves the ticket itself in a
 * partial state, since ticket creation and attachment recording are separate steps.
 */
export async function uploadSupportTicketAttachment(
  ticketId: string,
  userId: string,
  file: StagedSupportAttachment,
  commentId?: string | null,
): Promise<{ attachmentId: string } | { error: Error }> {
  const validationError = validateSupportAttachment(file);
  if (validationError) return { error: new Error(validationError) };

  const safeName = file.fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `${userId}/${ticketId}/${uuidv7()}-${safeName}`;

  const { error: uploadError } = await supabase()
    .storage.from(SUPPORT_ATTACHMENTS_BUCKET)
    .upload(storagePath, file.arrayBuffer, {
      contentType: file.mimeType,
      upsert: false,
    });
  if (uploadError) return { error: new Error(uploadError.message) };

  const { data, error } = await supabase().rpc('record_support_ticket_attachment', {
    p_ticket_id: ticketId,
    p_storage_path: storagePath,
    p_mime_type: file.mimeType,
    p_size_bytes: file.sizeBytes,
    p_comment_id: commentId ?? null,
  });
  if (error) return { error: new Error(error.message) };
  return { attachmentId: data as string };
}

export async function getSupportAttachmentSignedUrl(
  storagePath: string,
): Promise<string | null> {
  const { data, error } = await supabase()
    .storage.from(SUPPORT_ATTACHMENTS_BUCKET)
    .createSignedUrl(storagePath, 3600);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}
