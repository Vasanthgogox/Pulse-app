import { buildIndentInsertFromExecutionPlan } from '../indentRepository';

describe('buildIndentInsertFromExecutionPlan', () => {
  const base = {
    workspaceId: 'org-1',
    executionPlanId: 'plan-1',
    vehicleType: '32FT',
    orderCount: 2,
    totalWeightKg: 100,
    totalAmount: 5000,
    supplierTarget: 0,
    pickupSummary: 'A',
    dropSummary: 'B',
    requestedBy: 'user-1',
    nowIso: '2026-09-15T10:00:00.000Z',
  };

  it('creates a draft indent, not broadcast/share', () => {
    const row = buildIndentInsertFromExecutionPlan(base);
    expect(row.status).toBe('draft');
    expect(row.shared_at).toBeNull();
    expect(row.last_saved_at).toBe('2026-09-15T10:00:00.000Z');
    expect(row.execution_plan_id).toBe('plan-1');
    expect(row.sales_order_id).toBeNull();
  });

  it('stores an optional supplier target without requiring bidding', () => {
    expect(buildIndentInsertFromExecutionPlan(base).supplier_target).toBe(0);
    expect(buildIndentInsertFromExecutionPlan({ ...base, supplierTarget: 12000 }).supplier_target).toBe(12000);
  });
});
