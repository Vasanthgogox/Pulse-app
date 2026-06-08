/**
 * EventService — Phase 3 Event Platform Foundation
 *
 * Emit immutable domain events for every entity change.
 * Events use UUIDv7 IDs only — never business references.
 * Backed by event_store + event_outbox (transactional outbox for Kafka).
 *
 * Architecture (P6: Event-stream ready):
 *   Entity mutation → emit_event() → event_store (append-only)
 *                                  → event_outbox (Kafka delivery queue)
 *                                  → activity_stream (logistics social feed)
 *
 * Usage:
 *   await EventService.emit('TripCreated', 'trip', trip.id, { trip }, orgId, userId);
 */

import { supabase } from '@/lib/supabase';

// ── Known event types (mirrors event_schema_registry) ────────────────────────

export type TripEventType =
  | 'TripCreated'    | 'TripUpdated'    | 'TripAssigned'
  | 'TripStarted'    | 'TripCompleted'  | 'TripCancelled'
  | 'DriverAssigned' | 'DriverReassigned';

export type IndentEventType =
  | 'IndentCreated' | 'IndentAwarded' | 'IndentCancelled';

export type InvoiceEventType =
  | 'InvoiceCreated' | 'InvoiceApproved' | 'PaymentReceived';

export type BookingEventType =
  | 'BookingCreated' | 'BookingAccepted';

export type NetworkEventType =
  | 'LoadShared' | 'OrganizationJoined';

export type PlatformEventType =
  | TripEventType | IndentEventType | InvoiceEventType
  | BookingEventType | NetworkEventType | string;

export type AggregateType = 'trip' | 'indent' | 'driver' | 'fleet' | 'invoice' | 'booking' | 'org' | string;

export interface EmitOptions {
  orgId?:          string | null;
  userId?:         string | null;
  agentId?:        string | null;       // AI agent identifier
  causedBy?:       string | null;       // parent event UUID
  correlationId?:  string | null;       // saga / workflow grouping
  metadata?:       Record<string, unknown>;
}

class _EventService {
  /**
   * Emit a domain event.
   *
   * @param eventType     - e.g. 'TripCreated'
   * @param aggregateType - e.g. 'trip'
   * @param aggregateId   - entity UUID (immutable PK) — NEVER a business reference
   * @param payload       - event data
   * @param opts          - context options
   * @returns eventId (UUIDv7) or null on failure
   */
  async emit(
    eventType:     PlatformEventType,
    aggregateType: AggregateType,
    aggregateId:   string,
    payload:       Record<string, unknown>,
    opts:          EmitOptions = {},
  ): Promise<string | null> {
    try {
      const { data, error } = await supabase().rpc('emit_event', {
        p_event_type:     eventType,
        p_aggregate_type: aggregateType,
        p_aggregate_id:   aggregateId,
        p_payload:        payload,
        p_org_id:         opts.orgId ?? null,
        p_user_id:        opts.userId ?? null,
        p_caused_by:      opts.causedBy ?? null,
        p_correlation_id: opts.correlationId ?? null,
        p_metadata:       { agentId: opts.agentId, ...opts.metadata },
      });
      if (error) {
        console.warn('[EventService] emit failed:', error.message);
        return null;
      }
      return String(data ?? '');
    } catch (err) {
      console.warn('[EventService] emit exception:', err);
      return null;
    }
  }

  // ── Entity-specific convenience emitters ────────────────────────────────────

  async tripCreated(tripId: string, trip: Record<string, unknown>, opts: EmitOptions = {}) {
    return this.emit('TripCreated', 'trip', tripId, trip, opts);
  }

  async tripAssigned(tripId: string, driverId: string, vehicleId: string | null, opts: EmitOptions = {}) {
    return this.emit('TripAssigned', 'trip', tripId, { driverId, vehicleId }, opts);
  }

  async tripCompleted(tripId: string, completedAt: string, opts: EmitOptions = {}) {
    return this.emit('TripCompleted', 'trip', tripId, { completedAt }, opts);
  }

  async indentCreated(indentId: string, indent: Record<string, unknown>, opts: EmitOptions = {}) {
    return this.emit('IndentCreated', 'indent', indentId, indent, opts);
  }

  async indentAwarded(indentId: string, awardedTo: string, tripId: string | null, opts: EmitOptions = {}) {
    return this.emit('IndentAwarded', 'indent', indentId, { awardedTo, tripId }, opts);
  }

  async loadShared(tripId: string, sharedWithOrg: string, networkRef: string, opts: EmitOptions = {}) {
    return this.emit('LoadShared', 'trip', tripId, { sharedWithOrg, networkRef }, opts);
  }

  async invoiceCreated(invoiceId: string, invoice: Record<string, unknown>, opts: EmitOptions = {}) {
    return this.emit('InvoiceCreated', 'invoice', invoiceId, invoice, opts);
  }

  async paymentReceived(invoiceId: string, amount: number, txnId: string, opts: EmitOptions = {}) {
    return this.emit('PaymentReceived', 'invoice', invoiceId, { amount, txnId }, opts);
  }

  // ── Activity feed ───────────────────────────────────────────────────────────

  async recordActivity(
    activityType: string,
    actorType:    'user' | 'ai_agent' | 'system' | 'organization',
    actorId:      string,
    actorName:    string | null,
    targetType:   string,
    targetId:     string,
    opts: {
      targetRef?:  string;
      targetName?: string;
      orgId?:      string;
      context?:    Record<string, unknown>;
      isPublic?:   boolean;
    } = {},
  ): Promise<string | null> {
    try {
      const { data, error } = await supabase().rpc('record_activity', {
        p_activity_type: activityType,
        p_actor_type:    actorType,
        p_actor_id:      actorId,
        p_actor_name:    actorName,
        p_target_type:   targetType,
        p_target_id:     targetId,
        p_target_ref:    opts.targetRef ?? null,
        p_target_name:   opts.targetName ?? null,
        p_org_id:        opts.orgId ?? null,
        p_context:       opts.context ?? {},
        p_is_public:     opts.isPublic ?? false,
      });
      if (error) {
        console.warn('[EventService] recordActivity failed:', error.message);
        return null;
      }
      return String(data ?? '');
    } catch (err) {
      console.warn('[EventService] recordActivity exception:', err);
      return null;
    }
  }
}

export const EventService = new _EventService();
