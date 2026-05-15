/**
 * Maps Postgres / RPC rows → shared-ledger notification shape (global sync slice).
 */
import type { SharedLedgerNotificationRow } from '@/services/sharedLedgerNotificationsService';

export function mapSharedLedgerRow(
  raw: Record<string, unknown>,
): SharedLedgerNotificationRow {
  const payload = raw.payload_json;
  const rawEventType = String(raw.event_type ?? 'mismatch_detected')
    .trim()
    .toLowerCase();
  const rawStatus = String(raw.status ?? 'open').trim().toLowerCase();
  const eventType =
    rawEventType === 'dispute_received' ||
    rawEventType === 'dispute_status_changed' ||
    rawEventType === 'pending_partner_followup' ||
    rawEventType === 'mismatch_detected' ||
    rawEventType === 'partner_only_ghost'
      ? rawEventType
      : 'mismatch_detected';
  const status =
    rawStatus === 'open' ||
    rawStatus === 'read' ||
    rawStatus === 'handled' ||
    rawStatus === 'resolved'
      ? rawStatus
      : 'open';

  return {
    id: String(raw.id ?? ''),
    organization_id: String(raw.organization_id ?? ''),
    partner_org_id:
      raw.partner_org_id == null ? null : String(raw.partner_org_id),
    partner_key: raw.partner_key == null ? null : String(raw.partner_key),
    trip_id: raw.trip_id == null ? null : String(raw.trip_id),
    transaction_id:
      raw.transaction_id == null ? null : String(raw.transaction_id),
    source_dispute_id:
      raw.source_dispute_id == null ? null : String(raw.source_dispute_id),
    event_type: eventType,
    status,
    title: String(raw.title ?? 'Shared ledger'),
    subtitle: raw.subtitle == null ? null : String(raw.subtitle),
    amount_meta:
      raw.amount_meta == null || Number.isNaN(Number(raw.amount_meta))
        ? null
        : Number(raw.amount_meta),
    payload_json:
      payload && typeof payload === 'object' && !Array.isArray(payload)
        ? (payload as Record<string, unknown>)
        : {},
    created_at: String(raw.created_at ?? new Date().toISOString()),
    updated_at: raw.updated_at == null ? null : String(raw.updated_at),
    read_at: raw.read_at == null ? null : String(raw.read_at),
    handled_at: raw.handled_at == null ? null : String(raw.handled_at),
  };
}
