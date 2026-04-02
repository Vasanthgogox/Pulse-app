import {
  aggregateCustomers,
  aggregateSuppliers,
} from '@/features/finance/aggregation';
import {
  buildUniqueLinkedOrgIdMap,
  canOrgSeeTripAsIntegratedClient,
  canOrgSeeTripAsIntegratedSupplier,
  isTripEligibleForSharedLedger,
  isLoadBasedTrip,
} from '@/features/trips/visibility/tripVisibility';

describe('trip visibility contract', () => {
  it('keeps manual tagged trips private and exposes only load-based trips', () => {
    const clientById = new Map([
      [
        'client-1',
        { id: 'client-1', is_integrated: true, linked_organization_id: 'viewer-org' },
      ],
    ]);
    const supplierById = new Map([
      [
        'supplier-1',
        { id: 'supplier-1', supplier_type: 'integrated', linked_organization_id: 'viewer-org' },
      ],
    ]);

    const manualTrip = { indent_id: null, client_id: 'client-1', supplier_id: 'supplier-1' };
    const loadTrip = { indent_id: 'indent-1', client_id: 'client-1', supplier_id: 'supplier-1' };

    expect(isLoadBasedTrip(manualTrip)).toBe(false);
    expect(isLoadBasedTrip(loadTrip)).toBe(true);
    expect(canOrgSeeTripAsIntegratedClient(manualTrip, 'viewer-org', clientById)).toBe(false);
    expect(canOrgSeeTripAsIntegratedSupplier(manualTrip, 'viewer-org', supplierById)).toBe(false);
    expect(isTripEligibleForSharedLedger(manualTrip, 'viewer-org', { clientById, supplierById })).toBe(false);
    expect(canOrgSeeTripAsIntegratedClient(loadTrip, 'viewer-org', clientById)).toBe(true);
    expect(canOrgSeeTripAsIntegratedSupplier(loadTrip, 'viewer-org', supplierById)).toBe(true);
    expect(isTripEligibleForSharedLedger(loadTrip, 'viewer-org', { clientById, supplierById })).toBe(true);
  });

  it('rejects ambiguous duplicate linked rows', () => {
    const uniqueMap = buildUniqueLinkedOrgIdMap([
      { id: 'client-1', linked_organization_id: 'owner-org' },
      { id: 'client-2', linked_organization_id: 'owner-org' },
    ]);

    expect(uniqueMap.has('owner-org')).toBe(false);
  });
});

describe('integrated aggregation guardrails', () => {
  it('does not attribute manual supplier-side trips to integrated customers', () => {
    const clients = [
      {
        id: 'client-1',
        name: 'Owner Org',
        is_integrated: true,
        linked_organization_id: 'owner-org',
      },
    ];

    const manualTrips = [
      {
        id: 'trip-1',
        client_id: null,
        client_name: 'End Customer',
        client_price: 1200,
        supplier_rate: 700,
        organization_id: 'owner-org',
        indent_id: null,
        amount_paid: 0,
      },
    ];

    const loadTrips = [
      {
        ...manualTrips[0],
        id: 'trip-2',
        indent_id: 'indent-1',
      },
    ];

    const manualRows = aggregateCustomers(clients, manualTrips, [], {}).rows;
    const loadRows = aggregateCustomers(clients, loadTrips, [], {}).rows;

    expect(manualRows[0]?.trips).toBe(0);
    expect(manualRows[0]?.billed).toBe(0);
    expect(loadRows[0]?.trips).toBe(1);
    expect(loadRows[0]?.billed).toBe(700);
  });

  it('does not attribute manual client-side trips to integrated suppliers', () => {
    const suppliers = [
      {
        id: 'supplier-1',
        name: 'Owner Org',
        supplier_type: 'integrated' as const,
        linked_organization_id: 'owner-org',
      },
    ];

    const manualAsClientTrips = [
      {
        supplier_id: null,
        supplier_name: null,
        supplier_rate: 900,
        client_price: 900,
        organization_id: 'owner-org',
        indent_id: null,
      },
    ];

    const loadAsClientTrips = [
      {
        ...manualAsClientTrips[0],
        indent_id: 'indent-2',
      },
    ];

    const manualRows = aggregateSuppliers(
      suppliers,
      [],
      [],
      manualAsClientTrips,
      {},
    ).rows;
    const loadRows = aggregateSuppliers(
      suppliers,
      [],
      [],
      loadAsClientTrips,
      {},
    ).rows;

    expect(manualRows[0]?.trips).toBe(0);
    expect(manualRows[0]?.payables).toBe(0);
    expect(loadRows[0]?.trips).toBe(1);
    expect(loadRows[0]?.payables).toBe(900);
  });
});
