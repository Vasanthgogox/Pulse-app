import {
  classifyCommerceOpsStage,
  collapseCommerceExecutionsToIndentGroups,
  commerceOpsCardTitle,
  commerceOpsDetailKind,
  commerceOpsGroupKey,
  commerceOpsGroupTimeline,
  commerceOpsIndentStatus,
  commerceOpsMatchesSearch,
  commerceOpsOrderJourney,
  commerceOpsPrimaryPath,
  commerceOpsSourceTags,
  commerceOpsStageLabel,
  commerceOpsStopPath,
  countCommerceOpsByStage,
  filterCommerceOpsByStage,
} from '../commerce-ops-hub';
import { planLifecycleKind, planLifecycleLabel } from '../commerce-execution-status';
import type { CommerceExecution } from '../services/execution-visibility.service';

function baseExec(over: Partial<CommerceExecution> = {}): CommerceExecution {
  return {
    executionPlanId: 'plan-1',
    planNumber: 'EP-2026-0005',
    planStatus: 'published',
    correlationId: null,
    publishedAt: '2026-09-14T11:56:00Z',
    createdAt: '2026-09-14T11:56:00Z',
    orderCount: 2,
    totalAmount: 371700,
    totalWeightKg: 100,
    stopCount: 3,
    stops: [
      { id: 's1', type: 'pickup', sequence: 1, label: 'Pickup A', city: 'A', sourceType: 'warehouse', executionStatus: null },
      { id: 's2', type: 'drop', sequence: 2, label: 'Drop C', city: 'C', sourceType: 'consignee', executionStatus: null },
    ],
    indent: {
      id: 'ind-1',
      indentNumber: 'IND059',
      status: 'open',
      pickupArea: 'Pickup A',
      dropLocation: 'Drop C',
      clientName: 'Nvidia a',
      clientPrice: 371700,
      vehicleType: 'Truck',
      loadType: 'General',
      weightKg: 100,
      pickupDate: null,
      supplierTarget: 12000,
      circulationTarget: 'both',
      assignedSupplierId: null,
      assignedSupplierRate: null,
    },
    trip: null,
    bidCount: 0,
    bestBidAmount: null,
    orders: [
      { id: 'o1', orderNumber: 'SO-2026-00084', customerName: 'Nvidia a', amount: 100, deliveryStatus: null },
    ],
    ...over,
  };
}

describe('classifyCommerceOpsStage', () => {
  it('puts unallocated indent on INDENT', () => {
    expect(classifyCommerceOpsStage(baseExec())).toBe('indent');
    expect(commerceOpsDetailKind(baseExec())).toBe('indent');
  });

  it('does not treat cancelled trip as allocated', () => {
    const exec = baseExec({
      trip: {
        id: 't1',
        tripNumber: 'TRP1',
        status: 'cancelled',
        supplierRate: 0,
        supplierName: null,
        driverId: 'd1',
        driverName: 'X',
        vehicleNumber: 'KA01',
        pickupArea: 'A',
        dropLocation: 'C',
      },
    });
    expect(classifyCommerceOpsStage(exec)).toBe('indent');
  });

  it('unassigned when trip exists without driver_id', () => {
    const exec = baseExec({
      trip: {
        id: 't1',
        tripNumber: 'TRP1',
        status: 'assigned',
        supplierRate: 5000,
        supplierName: 'Fleet',
        driverId: null,
        driverName: null,
        vehicleNumber: null,
        pickupArea: 'A',
        dropLocation: 'C',
      },
    });
    expect(classifyCommerceOpsStage(exec)).toBe('unassigned');
    expect(commerceOpsStageLabel(exec)).toBe('UNASSIGNED');
  });

  it('assigned when driver_id set and status assigned', () => {
    const exec = baseExec({
      trip: {
        id: 't1',
        tripNumber: 'TRP1',
        status: 'assigned',
        supplierRate: 5000,
        supplierName: 'Fleet',
        driverId: 'drv-1',
        driverName: 'Ravi',
        vehicleNumber: 'KA01AB1234',
        pickupArea: 'A',
        dropLocation: 'C',
      },
    });
    expect(classifyCommerceOpsStage(exec)).toBe('assigned');
  });

  it('loading / in_transit / unloading match Core trip buckets', () => {
    const trip = {
      id: 't1',
      tripNumber: 'TRP1',
      status: 'in_progress',
      supplierRate: 1,
      supplierName: null,
      driverId: 'd1',
      driverName: 'Ravi',
      vehicleNumber: 'KA01',
      pickupArea: 'A',
      dropLocation: 'C',
    };
    expect(classifyCommerceOpsStage(baseExec({ trip: { ...trip, status: 'in_progress' } }))).toBe('loading');
    expect(classifyCommerceOpsStage(baseExec({ trip: { ...trip, status: 'in_transit' } }))).toBe('in_transit');
    expect(classifyCommerceOpsStage(baseExec({ trip: { ...trip, status: 'at_drop' } }))).toBe('unloading');
  });

  it('delivered only when every order drop SES is completed', () => {
    const trip = {
      id: 't1',
      tripNumber: 'TRP1',
      status: 'completed',
      supplierRate: 1,
      supplierName: null,
      driverId: 'd1',
      driverName: 'Ravi',
      vehicleNumber: 'KA01',
      pickupArea: 'A',
      dropLocation: 'C',
    };
    const incomplete = baseExec({
      trip,
      orders: [{ id: 'o1', orderNumber: 'SO1', customerName: 'A', amount: 1, deliveryStatus: 'arrived' }],
    });
    expect(classifyCommerceOpsStage(incomplete)).toBe('unloading');
    const done = baseExec({
      trip,
      orders: [{ id: 'o1', orderNumber: 'SO1', customerName: 'A', amount: 1, deliveryStatus: 'completed' }],
    });
    expect(classifyCommerceOpsStage(done)).toBe('delivered');
  });
});

describe('indent Give Load presentation', () => {
  it('maps circulation_target like Core', () => {
    expect(commerceOpsSourceTags('both')).toEqual(['NETWORK', 'MARKETPLACE']);
    expect(commerceOpsSourceTags('offline')).toEqual([]);
    expect(commerceOpsSourceTags(null)).toEqual(['NETWORK']);
  });

  it('maps bid count to WAITING / RECEIVING / AWARDED', () => {
    expect(commerceOpsIndentStatus('open', 0)).toBe('WAITING FOR BID');
    expect(commerceOpsIndentStatus('draft', 2)).toBe('WAITING FOR BID');
    expect(commerceOpsIndentStatus('open', 2)).toBe('RECEIVING BIDS');
    expect(commerceOpsIndentStatus('awarded', 2)).toBe('AWARDED');
  });
});

describe('search and rail counts', () => {
  it('filters without extra queries', () => {
    const a = baseExec();
    const b = baseExec({
      executionPlanId: 'plan-2',
      planNumber: 'EP-OTHER',
      indent: { ...baseExec().indent!, indentNumber: 'IND999' },
    });
    expect(commerceOpsMatchesSearch(a, 'IND059')).toBe(true);
    expect(commerceOpsMatchesSearch(a, 'Nvidia')).toBe(true);
    expect(commerceOpsMatchesSearch(b, 'IND059')).toBe(false);
    const counts = countCommerceOpsByStage([a, b]);
    expect(counts.all).toBe(2);
    expect(counts.indent).toBe(2);
    expect(filterCommerceOpsByStage([a, b], 'assigned')).toHaveLength(0);
  });

  it('keeps detail routes inside Commerce', () => {
    expect(commerceOpsPrimaryPath(baseExec())).toBe('/execution/plan/plan-1');
  });
});

describe('indent-anchored Operations grouping', () => {
  it('titles the card with the indent, not the trip number', () => {
    const exec = baseExec({
      trip: {
        id: 't1',
        tripNumber: 'TRP051',
        status: 'completed',
        supplierRate: 1,
        supplierName: 'Hussain Transport',
        driverId: 'd1',
        driverName: 'Vincent',
        vehicleNumber: null,
        pickupArea: 'A',
        dropLocation: 'C',
      },
    });
    expect(commerceOpsCardTitle(exec)).toBe('IND059');
    expect(commerceOpsGroupKey(exec)).toBe('ind-1');
  });

  it('does not collapse distinct indents that merely look similar', () => {
    const a = baseExec();
    const b = baseExec({
      executionPlanId: 'plan-2',
      planNumber: 'EP-2026-0002',
      indent: { ...baseExec().indent!, id: 'ind-2', indentNumber: 'IND031' },
    });
    expect(collapseCommerceExecutionsToIndentGroups([a, b])).toHaveLength(2);
  });

  it('collapses two plan rows that share the same indent', () => {
    const a = baseExec();
    const b = baseExec({
      executionPlanId: 'plan-dup',
      planNumber: 'EP-DUP',
      stopCount: 1,
    });
    const collapsed = collapseCommerceExecutionsToIndentGroups([a, b]);
    expect(collapsed).toHaveLength(1);
    expect(collapsed[0].executionPlanId).toBe('plan-1');
  });

  it('builds a courier timeline from existing lifecycle fields only', () => {
    const exec = baseExec({
      stops: [
        { id: 's1', type: 'pickup', sequence: 1, label: 'Pickup A', city: 'A', sourceType: 'warehouse', executionStatus: 'completed' },
        { id: 's2', type: 'drop', sequence: 2, label: 'Drop C', city: 'C', sourceType: 'consignee', executionStatus: 'arrived' },
        { id: 's3', type: 'drop', sequence: 3, label: 'Drop D', city: 'D', sourceType: 'consignee', executionStatus: null },
      ],
      orders: [
        {
          id: 'o1',
          orderNumber: 'SO-00001',
          customerName: 'Hussain Transport',
          amount: 1,
          pickupStatus: 'completed',
          deliveryStatus: 'completed',
          dropLabel: 'Drop E',
        },
        {
          id: 'o2',
          orderNumber: 'SO-00002',
          customerName: 'Nvidia',
          amount: 1,
          pickupStatus: 'completed',
          deliveryStatus: 'arrived',
          dropLabel: 'Drop C',
        },
      ],
    });
    expect(commerceOpsStopPath(exec)).toBe('Pickup A → Drop C → Drop D');
    const timeline = commerceOpsGroupTimeline(exec);
    expect(timeline.find(i => i.id === 'orders')?.marker).toBe('done');
    expect(timeline.find(i => i.id === 'indent')?.marker).toBe('done');
    expect(timeline.find(i => i.id === 's1')?.marker).toBe('done');
    expect(timeline.find(i => i.id === 's2')?.marker).toBe('current');
    expect(timeline.find(i => i.id === 's3')?.marker).toBe('pending');
    expect(timeline.find(i => i.id === 'all-delivered')?.marker).toBe('pending');
    const so1 = commerceOpsOrderJourney(exec.orders[0]);
    expect(so1.map(s => s.marker)).toEqual(['done', 'done', 'done']);
    const so2 = commerceOpsOrderJourney(exec.orders[1]);
    expect(so2[0].marker).toBe('done');
    expect(so2[1].marker).toBe('current');
    expect(so2[2].marker).toBe('pending');
  });
});

describe('planLifecycleKind', () => {
  it('marks converted unpublished plans as DRAFT', () => {
    expect(planLifecycleKind('ready', undefined, 'indent-1')).toBe('indent_created');
    expect(planLifecycleLabel('indent_created')).toBe('DRAFT');
  });

  it('keeps a published plan with a draft indent as DRAFT, not posted/bidding', () => {
    const exec = baseExec({
      indent: { ...baseExec().indent!, status: 'draft' },
    });
    expect(planLifecycleKind('published', exec, exec.indent?.id)).toBe('indent_created');
  });

  it('uses live trip as the lock/allocation boundary', () => {
    const exec = baseExec({
      planStatus: 'published',
      trip: {
        id: 't1',
        tripNumber: 'TRP051',
        status: 'assigned',
        supplierRate: 1,
        supplierName: null,
        driverId: 'd1',
        driverName: 'A',
        vehicleNumber: 'KA',
        pickupArea: 'A',
        dropLocation: 'C',
      },
    });
    expect(planLifecycleKind('published', exec, exec.indent?.id)).toBe('trip_assigned');
  });
});

