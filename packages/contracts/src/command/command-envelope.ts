/**
 * Frozen Command Envelope v1 — oms/docs/contracts/COMMAND_ENVELOPE.md
 * Never remove fields; only add optional ones in new schemaVersion values.
 */
import type { SchemaVersion } from '../common/metadata';

export const COMMAND_ENVELOPE_SCHEMA_VERSION: SchemaVersion = 'v1';

export type CommandStoreStatus =
  | 'RECEIVED'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'STALE'
  | 'RETRYING'
  | 'FAILED';

export interface CommandEnvelope<TPayload = Record<string, unknown>> {
  commandId:       string;
  commandName:     string;
  commandVersion:  string;
  schemaVersion:   SchemaVersion;
  idempotencyKey:  string;
  correlationId:   string;
  causationId?:    string;
  tenantId:        string;
  payload:         TPayload;
}

export interface CommandRecord<TPayload = Record<string, unknown>, TResponse = unknown>
  extends CommandEnvelope<TPayload> {
  status:               CommandStoreStatus;
  processingStartedAt?: string;
  completedAt?:         string;
  responsePayload?:     TResponse;
  responseCode?:        number;
  requestHash?:         string;
  createdAt:            string;
  updatedAt:            string;
}
