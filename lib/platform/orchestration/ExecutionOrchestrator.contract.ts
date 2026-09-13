import type {
  PublishExecutionPlanCommand,
  PublishExecutionPlanResult,
  PublishIndentCommand,
  PublishIndentResult,
} from '../orchestration/types';

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

  /**
   * Publishes a merged multi-order execution plan built by the Commerce merge
   * engine and creates its linked Core indent. Idempotent per
   * (workspaceId, payload.clientPlanId).
   */
  publishExecutionPlan(command: PublishExecutionPlanCommand): Promise<PublishExecutionPlanResult>;
};
