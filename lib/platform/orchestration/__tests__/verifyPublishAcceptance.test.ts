import {
  clearPlatformEventLog,
  getPlatformEventLogByCorrelationId,
  recordPlatformEventLog,
  setPlatformEventLogEnabled,
} from '../../events/PlatformEventLog';
import { verifyPublishIndentAcceptance } from '../verifyPublishAcceptance';

beforeEach(() => {
  clearPlatformEventLog();
  setPlatformEventLogEnabled(true);
});

describe('verifyPublishIndentAcceptance', () => {
  it('passes when two ordered events match expected lineage', () => {
    const correlationId = 'corr-1';
    const workspaceId = 'org-1';
    const orderId = 'order-1';
    const indentId = 'indent-1';

    recordPlatformEventLog({
      name: 'OrderReadyForDispatch',
      workspaceId,
      correlationId,
      occurredAt: '2026-01-01T00:00:00.000Z',
      payload: { orderId, orderNumber: 'SO-1', requestedBy: 'user-1' },
    });
    recordPlatformEventLog({
      name: 'IndentCreated',
      workspaceId,
      correlationId,
      occurredAt: '2026-01-01T00:00:01.000Z',
      payload: { orderId, indentId },
    });

    const result = verifyPublishIndentAcceptance(correlationId, {
      workspaceId,
      orderId,
      indentId,
    });

    expect(result.ok).toBe(true);
    expect(result.events).toHaveLength(2);
    expect(result.events[0].eventName).toBe('OrderReadyForDispatch');
    expect(result.events[1].indentId).toBe(indentId);
    expect(getPlatformEventLogByCorrelationId(correlationId)).toHaveLength(2);
  });

  it('fails when event count or ordering is wrong', () => {
    const result = verifyPublishIndentAcceptance('missing', {
      workspaceId: 'org-1',
      orderId: 'order-1',
      indentId: 'indent-1',
    });
    expect(result.ok).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});
