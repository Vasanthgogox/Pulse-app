import type { PublishIndentCommand, PublishIndentResult } from '@pulse-platform/index';
import { getExecutionOrchestrator } from '@pulse-platform/index';

export type PublishIndentContext = {
  workspaceId: string;
  requestedBy: string;
};

export async function publishIndentForOrder(
  orderId: string,
  ctx: PublishIndentContext,
): Promise<PublishIndentResult> {
  const command: PublishIndentCommand = {
    correlationId: crypto.randomUUID(),
    workspaceId: ctx.workspaceId,
    requestedBy: ctx.requestedBy,
    requestedAt: new Date().toISOString(),
    payload: { orderId },
  };
  return getExecutionOrchestrator().publishIndent(command);
}
