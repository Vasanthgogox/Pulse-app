/**
 * Orchestration command envelope — every entry point uses this shape.
 * Commands express intent; events (lib/platform/events) describe facts that occurred.
 */
export type OrchestrationCommandEnvelope<TPayload> = {
  correlationId: string;
  workspaceId: string;
  requestedBy: string;
  requestedAt: string;
  payload: TPayload;
};

export type PublishIndentCommandPayload = {
  orderId: string;
};

export type PublishIndentCommand = OrchestrationCommandEnvelope<PublishIndentCommandPayload>;

export type PublishIndentResult = {
  indentId: string;
  orderId: string;
  correlationId: string;
};

export type OrchestrationErrorCode =
  | 'INVALID_COMMAND'
  | 'ORDER_NOT_FOUND'
  | 'ORDER_NOT_DISPATCHABLE'
  | 'MISSING_CUSTOMER'
  | 'MISSING_WAREHOUSE';

export type OrchestrationError = {
  code: OrchestrationErrorCode;
  message: string;
  correlationId: string;
};
