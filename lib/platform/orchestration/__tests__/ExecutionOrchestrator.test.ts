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
const mockListPlanLinks = jest.fn();
const mockMarkPlannedForExecutionPlan = jest.fn();
const mockFindBySalesOrderId = jest.fn();
const mockCreateFromSalesOrder = jest.fn();
const mockFindClientRecord = jest.fn();
const mockFindWarehouseRecordById = jest.fn();
const mockFindByClientPlanId = jest.fn();
const mockFindPlanById = jest.fn();
const mockCreateWithGraph = jest.fn();
const mockMarkPublished = jest.fn();
const mockFindIndentByExecutionPlanId = jest.fn();
const mockCreateFromExecutionPlan = jest.fn();

jest.mock('../../services/OrderService', () => ({
  OrderService: {
    getForPublish: (...args: unknown[]) => mockGetForPublish(...args),
    markPlanned: (...args: unknown[]) => mockMarkPlanned(...args),
    isDispatchable: (...args: unknown[]) => mockIsDispatchable(...args),
    listPlanLinks: (...args: unknown[]) => mockListPlanLinks(...args),
    markPlannedForExecutionPlan: (...args: unknown[]) => mockMarkPlannedForExecutionPlan(...args),
  },
}));

jest.mock('../../services/ExecutionPlanService', () => ({
  ExecutionPlanService: {
    findByClientPlanId: (...args: unknown[]) => mockFindByClientPlanId(...args),
    findById: (...args: unknown[]) => mockFindPlanById(...args),
    createWithGraph: (...args: unknown[]) => mockCreateWithGraph(...args),
    markPublished: (...args: unknown[]) => mockMarkPublished(...args),
  },
}));

jest.mock('../../repositories/indentRepository', () => ({
  indentRepository: {
    findByExecutionPlanId: (...args: unknown[]) => mockFindIndentByExecutionPlanId(...args),
  },
}));

jest.mock('../../services/IndentService', () => ({
  IndentService: {
    findBySalesOrderId: (...args: unknown[]) => mockFindBySalesOrderId(...args),
    createFromSalesOrder: (...args: unknown[]) => mockCreateFromSalesOrder(...args),
    createFromExecutionPlan: (...args: unknown[]) => mockCreateFromExecutionPlan(...args),
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
  mockListPlanLinks.mockResolvedValue([]);
  mockMarkPlannedForExecutionPlan.mockResolvedValue(undefined);
  mockFindByClientPlanId.mockResolvedValue(null);
  mockFindPlanById.mockResolvedValue(null);
  mockCreateWithGraph.mockResolvedValue({ id: 'plan-1', planNumber: 'EP-1', status: 'ready' });
  mockMarkPublished.mockResolvedValue(undefined);
  mockFindIndentByExecutionPlanId.mockResolvedValue(null);
  mockCreateFromExecutionPlan.mockResolvedValue({ id: 'indent-plan', indentCode: 'IND100' });
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

const planCommand = {
  correlationId,
  workspaceId,
  requestedBy,
  requestedAt: new Date().toISOString(),
  payload: {
    clientPlanId: 'PLN009',
    vehicleType: '32FT',
    totalWeightKg: 100,
    route: { sequence: ['s1'] },
    stops: [],
    allocations: [],
    orders: [{
      orderId,
      customerId: 'cust-1',
      customerName: 'Acme',
      totalAmount: 100,
      lineItems: [],
    }],
    supplierTarget: 45000,
  },
};

describe('ExecutionOrchestrator.publishExecutionPlan', () => {
  it('reuses the existing plan when the same orders are already linked', async () => {
    mockListPlanLinks.mockResolvedValue([
      { id: orderId, orderNumber: 'SO-001', status: 'Planned', executionPlanId: 'plan-existing' },
    ]);
    mockFindPlanById.mockResolvedValue({ id: 'plan-existing', planNumber: 'EP-0001', status: 'published' });
    mockFindIndentByExecutionPlanId.mockResolvedValue({ id: 'indent-existing', indentCode: 'IND029' });

    const orchestrator = createExecutionOrchestrator(new InProcessEventBus());
    const result = await orchestrator.publishExecutionPlan(planCommand);

    expect(result.alreadyPublished).toBe(true);
    expect(result.executionPlanId).toBe('plan-existing');
    expect(mockCreateWithGraph).not.toHaveBeenCalled();
    expect(mockCreateFromExecutionPlan).not.toHaveBeenCalled();
  });

  it('refuses to create a second plan when orders are already on another plan', async () => {
    mockListPlanLinks.mockResolvedValue([
      { id: orderId, orderNumber: 'SO-001', status: 'Planned', executionPlanId: 'plan-a' },
      { id: 'order-2', orderNumber: 'SO-002', status: 'Pending Consolidation', executionPlanId: null },
    ]);

    const orchestrator = createExecutionOrchestrator(new InProcessEventBus());
    await expect(
      orchestrator.publishExecutionPlan({
        ...planCommand,
        payload: {
          ...planCommand.payload,
          orders: [
            planCommand.payload.orders[0],
            { ...planCommand.payload.orders[0], orderId: 'order-2' },
          ],
        },
      }),
    ).rejects.toMatchObject({ code: 'INVALID_COMMAND' });
    expect(mockCreateWithGraph).not.toHaveBeenCalled();
  });

  it('refuses to publish without a supplier target', async () => {
    mockListPlanLinks.mockResolvedValue([
      { id: orderId, orderNumber: 'SO-001', status: 'Pending Consolidation', executionPlanId: null },
    ]);
    const orchestrator = createExecutionOrchestrator(new InProcessEventBus());
    await expect(
      orchestrator.publishExecutionPlan({
        ...planCommand,
        payload: { ...planCommand.payload, supplierTarget: 0 },
      }),
    ).rejects.toMatchObject({ code: 'INVALID_COMMAND' });
    expect(mockCreateFromExecutionPlan).not.toHaveBeenCalled();
  });
});
