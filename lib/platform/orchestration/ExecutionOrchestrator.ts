import { getPlatformEventBus } from '../events/InProcessEventBus';
import type { EventBus } from '../events/EventBus.contract';
import { CustomerService } from '../services/CustomerService';
import { IndentService } from '../services/IndentService';
import { OrderService } from '../services/OrderService';
import { WarehouseService } from '../services/WarehouseService';
import type { ExecutionOrchestrator } from './ExecutionOrchestrator.contract';
import type {
  OrchestrationError,
  PublishIndentCommand,
  PublishIndentResult,
} from './types';

function fail(code: OrchestrationError['code'], message: string, correlationId: string): never {
  const err = new Error(message) as Error & OrchestrationError;
  err.code = code;
  err.correlationId = correlationId;
  throw err;
}

function requireCorrelationId(correlationId: string | undefined, fallback: string): string {
  const id = correlationId?.trim();
  if (!id) fail('INVALID_COMMAND', 'correlationId is required', fallback);
  return id;
}

async function publishDispatchEvents(
  eventBus: EventBus,
  input: {
    workspaceId: string;
    correlationId: string;
    orderId: string;
    orderNumber: string;
    indentId: string;
    requestedBy: string;
  },
): Promise<void> {
  const { workspaceId, correlationId, orderId, orderNumber, indentId, requestedBy } = input;
  const occurredAt = new Date().toISOString();

  await eventBus.publish({
    name: 'OrderReadyForDispatch',
    workspaceId,
    correlationId,
    occurredAt,
    payload: { orderId, orderNumber, requestedBy },
  });

  await eventBus.publish({
    name: 'IndentCreated',
    workspaceId,
    correlationId,
    occurredAt: new Date().toISOString(),
    payload: { orderId, indentId },
  });
}

export function createExecutionOrchestrator(eventBus: EventBus = getPlatformEventBus()): ExecutionOrchestrator {
  return {
    async publishIndent(command: PublishIndentCommand): Promise<PublishIndentResult> {
      const correlationId = requireCorrelationId(command.correlationId, 'missing-correlation-id');
      const { workspaceId, requestedBy, payload } = command;

      const order = await OrderService.getForPublish(workspaceId, payload.orderId);
      if (!order) {
        fail('ORDER_NOT_FOUND', 'Sales order not found', correlationId);
      }

      const existingIndent = await IndentService.findBySalesOrderId(workspaceId, order.id);

      if (order.status === 'Planned') {
        if (!existingIndent) {
          fail(
            'ORDER_NOT_DISPATCHABLE',
            'Order is Planned but has no linked indent',
            correlationId,
          );
        }
        return { indentId: existingIndent.id, orderId: order.id, correlationId };
      }

      if (!OrderService.isDispatchable(order.status)) {
        fail('ORDER_NOT_DISPATCHABLE', `Order status "${order.status}" is not dispatchable`, correlationId);
      }
      if (!order.customerId) {
        fail('MISSING_CUSTOMER', 'Order has no customer', correlationId);
      }
      if (!order.pickupWarehouseId) {
        fail('MISSING_WAREHOUSE', 'Order has no pickup warehouse', correlationId);
      }

      const customer = await CustomerService.findClientRecord(workspaceId, order.customerId);
      if (!customer) {
        fail('MISSING_CUSTOMER', 'Customer record not found', correlationId);
      }
      const warehouse = await WarehouseService.findWarehouseRecordById(order.pickupWarehouseId);
      if (!warehouse) {
        fail('MISSING_WAREHOUSE', 'Pickup warehouse not found', correlationId);
      }

      const indent =
        existingIndent ??
        (await IndentService.createFromSalesOrder({
          workspaceId,
          order,
          requestedBy,
        }));

      await OrderService.markPlanned(workspaceId, order.id);

      await publishDispatchEvents(eventBus, {
        workspaceId,
        correlationId,
        orderId: order.id,
        orderNumber: order.orderNumber,
        indentId: indent.id,
        requestedBy,
      });

      return {
        indentId: indent.id,
        orderId: order.id,
        correlationId,
      };
    },
  };
}

let orchestrator: ExecutionOrchestrator | null = null;

export function getExecutionOrchestrator(): ExecutionOrchestrator {
  if (!orchestrator) orchestrator = createExecutionOrchestrator();
  return orchestrator;
}

export function resetExecutionOrchestratorForTests(): void {
  orchestrator = null;
}
