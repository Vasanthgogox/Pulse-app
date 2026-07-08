import type { PublishIndentCommand, PublishIndentResult } from '../orchestration/types';

/**
 * Execution orchestrator contract — thin coordinator only.
 * Implementation: Phase 3.
 */
export type ExecutionOrchestrator = {
  /**
   * Primary entry point — accepts a command envelope.
   * Convenience wrappers may build the envelope from session context.
   */
  publishIndent(command: PublishIndentCommand): Promise<PublishIndentResult>;
};
