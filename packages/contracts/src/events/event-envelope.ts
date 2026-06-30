/**
 * Frozen Event Envelope v1 — oms/docs/contracts/EVENT_ENVELOPE.md
 */
import type { SchemaVersion } from '../common/metadata';

export const EVENT_ENVELOPE_SCHEMA_VERSION: SchemaVersion = 'v1';

export interface EventEnvelope<TPayload = Record<string, unknown>> {
  eventId:        string;
  eventName:      string;
  eventVersion:   string;
  schemaVersion:  SchemaVersion;
  occurredAt:     string;
  tenantId:       string;
  correlationId:  string;
  causationId?:   string;
  parentEventId?: string;
  payload:        TPayload;
}
