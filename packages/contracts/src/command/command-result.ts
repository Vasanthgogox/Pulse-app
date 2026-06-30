/**
 * Returned by business services to Platform Runtime.
 * Identity returns CommandResult — it does not know about Timeline.
 */
import type { CommandEnvelope } from './command-envelope';

export interface CommandResult<TData = unknown> {
  data:           TData;
  statusCode?:    number;
  events?:        never; // events published by runtime only
  commandEnvelope?: CommandEnvelope;
}
