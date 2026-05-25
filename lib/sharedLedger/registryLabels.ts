import type { SharedLedgerNotificationRow } from '@/features/finance/services/sharedLedgerNotifications.service';

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
