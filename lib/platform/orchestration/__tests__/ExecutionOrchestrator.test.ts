import { InProcessEventBus } from '../../events/InProcessEventBus';
import {
  clearPlatformEventLog,
  getPlatformEventLogByCorrelationId,
  setPlatformEventLogEnabled,
} from '../../events/PlatformEventLog';
import type { SalesOrderForPublish } from '../../repositories/orderRepository';
import { createExecutionOrchestrator } from '../ExecutionOrchestrator';

const mockGetForPublish = jest.fn();
const mockMarkPlanned = jest.fn();
const mockIsDispatchable = jest.fn();
const mockFindBySalesOrderId = jest.fn();
const mockCreateFromSalesOrder = jest.fn();
const mockFindClientRecord = jest.fn();
const mockFindWarehouseRecordById = jest.fn();

jest.mock('../../services/OrderService', () => ({
  OrderService: {
    getForPublish: (...args: unknown[]) => mockGetForPublish(...args),
    markPlanned: (...args: unknown[]) => mockMarkPlanned(...args),
    isDispatchable: (...args: unknown[]) => mockIsDispatchable(...args),
  },
}));

jest.mock('../../services/IndentService', () => ({
  IndentService: {
    findBySalesOrderId: (...args: unknown[]) => mockFindBySalesOrderId(...args),
    createFromSalesOrder: (...args: unknown[]) => mockCreateFromSalesOrder(...args),
  },
}));

jest.mock('../../services/CustomerService', () => ({
  CustomerService: {
    findClientRecord: (...args: unknown[]) => mockFindClientRecord(...args),
  },
}));

jest.mock('../../services/WarehouseService', () => ({
  WarehouseService: {
    findWarehouseRecordById: (...args: unknown[]) => mockFindWarehouseRecordById(...args),
  },
}));

const workspaceId = 'org-1';
const orderId = 'order-1';
const correlationId = 'corr-abc';
const requestedBy = 'user-1';

const pendingOrder: SalesOrderForPublish = {
  id: orderId,
  workspaceId,
  orderNumber: 'SO-001',
  status: 'Pending Consolidation',
  customerId: 'cust-1',
  customerName: 'Acme',
  pickupWarehouseId: 'wh-1',
  pickupArea: 'Mumbai',
  dropLocation: 'Pune',
  totalWeightKg: 1000,
  clientPrice: 5000,
};

const command = {
  correlationId,
  workspaceId,
  requestedBy,
  requestedAt: new Date().toISOString(),
  payload: { orderId },
};

beforeEach(() => {
  jest.clearAllMocks();
  clearPlatformEventLog();
  setPlatformEventLogEnabled(true);
  mockIsDispatchable.mockImplementation((status: string) => status === 'Pending Consolidation');
  mockFindBySalesOrderId.mockResolvedValue(null);
  mockCreateFromSalesOrder.mockResolvedValue({ id: 'indent-1', salesOrderId: orderId });
  mockMarkPlanned.mockResolvedValue(undefined);
  mockGetForPublish.mockResolvedValue(pendingOrder);
  mockFindClientRecord.mockResolvedValue({ id: 'cust-1' });
  mockFindWarehouseRecordById.mockResolvedValue({ id: 'wh-1' });
});

describe('ExecutionOrchestrator.publishIndent', () => {
  it('creates indent, marks order Planned, and emits ordered events with shared correlationId', async () => {
    const bus = new InProcessEventBus();
    const sequence: string[] = [];

    mockMarkPlanned.mockImplementation(async () => {
      sequence.push('markPlanned');
    });
    bus.subscribe('OrderReadyForDispatch', () => {
      sequence.push('OrderReadyForDispatch');
    });
    bus.subscribe('IndentCreated', () => {
      sequence.push('IndentCreated');
    });

    const orchestrator = createExecutionOrchestrator(bus);
    const result = await orchestrator.publishIndent(command);

    expect(result).toEqual({ indentId: 'indent-1', orderId, correlationId });
    expect(mockCreateFromSalesOrder).toHaveBeenCalledTimes(1);
    expect(sequence).toEqual(['markPlanned', 'OrderReadyForDispatch', 'IndentCreated']);

    const log = getPlatformEventLogByCorrelationId(correlationId);
    expect(log).toHaveLength(2);
    expect(log.map((e) => e.eventType)).toEqual(['OrderReadyForDispatch', 'IndentCreated']);
    expect(log.every((e) => e.correlationId === correlationId)).toBe(true);
  });

  it('is idempotent when order is already Planned with a linked indent', async () => {
    const bus = new InProcessEventBus();
    const published: string[] = [];
    bus.subscribe('OrderReadyForDispatch', () => { published.push('OrderReadyForDispatch'); });
    bus.subscribe('IndentCreated', () => { published.push('IndentCreated'); });

    mockGetForPublish.mockResolvedValue({ ...pendingOrder, status: 'Planned' });
    mockFindBySalesOrderId.mockResolvedValue({ id: 'indent-existing', salesOrderId: orderId });

    const orchestrator = createExecutionOrchestrator(bus);
    const result = await orchestrator.publishIndent(command);

    expect(result.indentId).toBe('indent-existing');
    expect(mockCreateFromSalesOrder).not.toHaveBeenCalled();
    expect(mockMarkPlanned).not.toHaveBeenCalled();
    expect(published).toEqual([]);
  });

  it('reuses existing indent when publish is retried before order is Planned', async () => {
    mockFindBySalesOrderId.mockResolvedValue({ id: 'indent-existing', salesOrderId: orderId });

    const bus = new InProcessEventBus();
    const orchestrator = createExecutionOrchestrator(bus);
    const result = await orchestrator.publishIndent(command);

    expect(result.indentId).toBe('indent-existing');
    expect(mockCreateFromSalesOrder).not.toHaveBeenCalled();
    expect(mockMarkPlanned).toHaveBeenCalledTimes(1);
  });

  it('does not emit events or mark Planned when indent creation fails', async () => {
    mockCreateFromSalesOrder.mockRejectedValue(new Error('insert failed'));

    const bus = new InProcessEventBus();
    const published: string[] = [];
    bus.subscribe('OrderReadyForDispatch', () => { published.push('OrderReadyForDispatch'); });
    bus.subscribe('IndentCreated', () => { published.push('IndentCreated'); });

    const orchestrator = createExecutionOrchestrator(bus);
    await expect(orchestrator.publishIndent(command)).rejects.toThrow('insert failed');

    expect(mockMarkPlanned).not.toHaveBeenCalled();
    expect(published).toEqual([]);
    expect(getPlatformEventLogByCorrelationId(correlationId)).toHaveLength(0);
  });

  it('does not emit events when markPlanned fails after indent exists', async () => {
    mockMarkPlanned.mockRejectedValue(new Error('status update failed'));

    const bus = new InProcessEventBus();
    const published: string[] = [];
    bus.subscribe('OrderReadyForDispatch', () => { published.push('OrderReadyForDispatch'); });
    bus.subscribe('IndentCreated', () => { published.push('IndentCreated'); });

    const orchestrator = createExecutionOrchestrator(bus);
    await expect(orchestrator.publishIndent(command)).rejects.toThrow('status update failed');

    expect(mockCreateFromSalesOrder).toHaveBeenCalledTimes(1);
    expect(published).toEqual([]);
  });

  it('requires correlationId on every command', async () => {
    const orchestrator = createExecutionOrchestrator(new InProcessEventBus());
    await expect(
      orchestrator.publishIndent({ ...command, correlationId: '  ' }),
    ).rejects.toMatchObject({ code: 'INVALID_COMMAND' });
  });
});
