import type { CommandEnvelope, CommandRecord } from '@pulse/contracts';
import type { EventEnvelope } from '@pulse/contracts';

/** Context passed to business handlers inside executeCommand. */
export interface CommandExecutionContext<TPayload = Record<string, unknown>> {
  envelope:   CommandEnvelope<TPayload>;
  record:     CommandRecord<TPayload>;
  tenantId:   string;
  publishEvent: <T>(event: EventEnvelope<T>) => Promise<EventEnvelope<T>>;
}

export interface ExecuteCommandResult<TResponse = unknown> {
  command:  CommandRecord<unknown, TResponse>;
  response: TResponse;
  events:   EventEnvelope[];
}

/**
 * Internal Platform Runtime — monorepo only until Phase 5 public SDK.
 *
 * executeCommand automatically:
 * 1. Validates payload schema
 * 2. Records command (RECEIVED → PROCESSING → COMPLETED | FAILED)
 * 3. Writes Timeline entry
 * 4. Publishes domain events (+ Timeline entries per event)
 * 5. Returns stored response (idempotent replay)
 *
 * Business services must not insert into command_store or platform_timeline directly.
 */
export interface PlatformRuntime {
  executeCommand<TPayload, TResponse>(
    envelope: CommandEnvelope<TPayload>,
    handler: (ctx: CommandExecutionContext<TPayload>) => Promise<TResponse>,
  ): Promise<ExecuteCommandResult<TResponse>>;
}

/** Stub — wired to Gateway + Command Store + Timeline in Sprint 2–4. */
export const PlatformRuntime: PlatformRuntime = {
  async executeCommand(_envelope, _handler) {
    throw new Error(
      'PlatformRuntime not wired — implement in packages/platform/runtime after Gateway + Command Store',
    );
  },
};
