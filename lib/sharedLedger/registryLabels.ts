import type { SharedLedgerNotificationRow } from '@/features/finance/services/sharedLedgerNotifications.service';
import type { NetworkNotificationEventType } from '@/features/network/services/networkNotifications.service';

/** Primary CTA per network lifecycle event. */
export function networkNotificationActionLabel(
  eventType: NetworkNotificationEventType,
): string {
  if (eventType === 'indent_created') return 'Place bid';
  if (eventType === 'bid_received') return 'Review bid';
  if (eventType === 'awarded') return 'View award';
  if (eventType === 'quote_requested') return 'Send quote';
  return 'Review offer';
}

/** Short tag shown on the card. */
export function networkNotificationTagLabel(
  eventType: NetworkNotificationEventType,
): string {
  if (eventType === 'indent_created') return 'New load';
  if (eventType === 'bid_received') return 'Bid';
  if (eventType === 'awarded') return 'Awarded';
  if (eventType === 'quote_requested') return 'Quote request';
  return 'Counter offer';
}

/** Verb used in the "<actor> <verb> <highlight>" card headline. */
export function networkNotificationActionText(
  eventType: NetworkNotificationEventType,
): string {
  if (eventType === 'indent_created') return 'posted';
  if (eventType === 'bid_received') return 'quoted';
  if (eventType === 'awarded') return 'awarded';
  if (eventType === 'quote_requested') return 'requested';
  return 'countered';
}

export function sharedLedgerActionLabel(
  eventType: SharedLedgerNotificationRow['event_type'],
): string {
  if (eventType === 'dispute_received') return 'Review';
  if (eventType === 'dispute_status_changed') return 'Status';
  if (eventType === 'pending_partner_followup') return 'Follow up';
  if (eventType === 'mismatch_detected') return 'Compare';
  return 'Fix';
}

export function resolveSharedActionKind(
  eventType: SharedLedgerNotificationRow['event_type'],
  payload: Record<string, unknown>,
):
  | 'review_dispute'
  | 'raise_dispute'
  | 'fix_records'
  | 'compare_now'
  | 'follow_up'
  | 'view_status' {
  const explicit = typeof payload.cta_kind === 'string' ? payload.cta_kind : '';
  if (
    explicit === 'review_dispute' ||
    explicit === 'raise_dispute' ||
    explicit === 'fix_records' ||
    explicit === 'compare_now' ||
    explicit === 'follow_up' ||
    explicit === 'view_status'
  ) {
    return explicit;
  }
  if (eventType === 'dispute_received') return 'review_dispute';
  if (eventType === 'pending_partner_followup') return 'follow_up';
  if (eventType === 'mismatch_detected') return 'compare_now';
  if (eventType === 'partner_only_ghost') return 'fix_records';
  return 'view_status';
}
