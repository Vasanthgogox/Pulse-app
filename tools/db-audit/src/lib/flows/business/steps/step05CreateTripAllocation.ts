import type { FlowBranch } from '@/lib/flowStep.types';

const SUPPLY_SHELL =
  'AllocationMobileWizardShell · AddTripFormFields · supply sub-step';
const MODE_BAR = 'SupplyAllocationModeBar (variant=wizard)';

/** Allocation wizard variants — mirrors allocationWizardSteps.ts + SupplyAllocationModeBar */
export const businessCreateTripAllocationBranches: FlowBranch[] = [
  {
    id: 'alloc-asset-now',
    label: 'Asset · assign now',
    badge: 'asset',
    summary: 'Asset chip + Assign later OFF — driver & vehicle grids on supply step',
    steps: [
      {
        id: 'bu-alloc-asset-supply',
        order: 1,
        label: 'Supply',
        title: 'Supply · asset · assign now',
        subtitle: 'Mode bar + inline fleet driver & vehicle pickers (same sub-step)',
        route: '/add-trip',
        screen: `${SUPPLY_SHELL} · ${MODE_BAR}`,
        phase: 'ui',
        reads: ['drivers', 'vehicles'],
        fieldMappings: [
          { input: 'supplySource (Asset chip)', storesTo: 'form.supplySource=asset → trip_payout_mode=asset' },
          { input: 'assignLater (Switch OFF)', storesTo: 'false — fleet pickers shown below mode bar' },
          { input: 'assetDriver', storesTo: 'form.driver_id → trips.driver_id' },
          { input: 'assetVehicle', storesTo: 'form.vehicle_id → trips.vehicle_id' },
          { input: 'driver_commission_percent', storesTo: 'trips.driver_commission_percent (from roster row)' },
          { input: 'driver_commission_per_km', storesTo: 'trips.driver_commission_per_km (from roster row)' },
        ],
        queries: [
          {
            label: 'Fleet roster reads',
            when: 'AssignmentEntityAvatarGrid on supply step — assignLater=false',
            sql: `SELECT id, name, phone, commission_percent, commission_per_km
FROM public.drivers
WHERE organization_id = :org_id AND left_at IS NULL;

SELECT id, vehicle_number, vehicle_type, capacity
FROM public.vehicles
WHERE organization_id = :org_id;`,
          },
        ],
        notes: [
          'UI: Asset / Aggregate chips then “Assign later” switch (OFF)',
          'Asset subtitle on switch: “Pick vehicle & driver on trip detail” (shown when OFF path active)',
          'Busy-driver hint: “Select an available driver or use Assign later.”',
          'Switch locks ON if driver_id + vehicle_id both set (must clear to enable assign later)',
          'Conflict on submit: getDriverOngoingTrip · getVehicleOngoingTrip',
          'getAllocationSubSteps: supply only — no separate fleetDriver/fleetVehicle sub-steps',
        ],
      },
    ],
  },
  {
    id: 'alloc-asset-later',
    label: 'Asset · assign later',
    badge: 'asset',
    summary: 'Same supply sub-step — Assign later Switch ON, no fleet grids',
    steps: [
      {
        id: 'bu-alloc-asset-later-supply',
        order: 1,
        label: 'Supply',
        title: 'Supply · asset · assign later',
        subtitle: 'SupplyAllocationModeBar — Assign later Switch ON (not a separate screen)',
        route: '/add-trip',
        screen: `${SUPPLY_SHELL} · ${MODE_BAR}`,
        phase: 'ui',
        fieldMappings: [
          { input: 'supplySource (Asset chip)', storesTo: 'asset' },
          {
            input: 'assignLater (Switch ON)',
            storesTo: 'true — driver_id and vehicle_id omitted on INSERT',
          },
        ],
        queries: [
          {
            label: 'No DB write',
            when: 'Supply sub-step only — getAllocationSubSteps: ["supply"]',
            sql: '-- No AssignmentEntityAvatarGrid when assignLater=true',
          },
        ],
        notes: [
          'UI label: “Assign later” · subtitle: “Pick vehicle & driver on trip detail”',
          'Warning when ON: “Assign vehicle and driver on the trip screen before the trip starts.”',
          'Switch disabled when driver_id + vehicle_id already selected',
          'Locked hint: “Remove driver or vehicle assignment to enable assign later.”',
        ],
        routing: [
          { context: 'Post-create', track: 'assign', nextScreen: '/trip/[id]/assignment' },
        ],
      },
    ],
  },
  {
    id: 'alloc-aggregate-now',
    label: 'Aggregate · assign now',
    badge: 'aggregate',
    summary: 'Supply (partner inline) → rates → phone → name → vehicle',
    steps: [
      {
        id: 'bu-alloc-agg-supply',
        order: 1,
        label: 'Supply',
        title: 'Supply · aggregate · assign now',
        subtitle: 'Mode bar + TripPartnerPickerSection inline on supply sub-step',
        route: '/add-trip',
        screen: `${SUPPLY_SHELL} · ${MODE_BAR} · TripPartnerPickerSection`,
        phase: 'ui',
        reads: ['suppliers'],
        fieldMappings: [
          { input: 'supplySource (Aggregate chip)', storesTo: 'form.supplySource=aggregate → trip_payout_mode=market' },
          { input: 'assignLater (Switch OFF)', storesTo: 'false — continues to phone/name/vehicle substeps' },
          { input: 'partner', storesTo: 'form.supplier_id → trips.supplier_id' },
          { input: 'supplier_name', storesTo: 'trips.supplier_name (display)' },
        ],
        queries: [
          {
            label: 'Supplier roster',
            when: 'TripPartnerPickerSection inline on supply (not a separate sub-step)',
            sql: `SELECT id, name, phone, supplier_type
FROM public.suppliers
WHERE organization_id = :org_id;`,
          },
        ],
        notes: [
          'Aggregate switch subtitle: “Add vehicle & driver phone on trip detail”',
          'Partner picker on same screen as mode bar — allocationSubStepFields(supply) includes partner',
        ],
      },
      {
        id: 'bu-alloc-agg-rates',
        order: 2,
        label: 'Rates',
        title: 'Partner rate & advance',
        subtitle: 'rates sub-step',
        route: '/add-trip',
        screen: `${SUPPLY_SHELL} · rates sub-step`,
        phase: 'ui',
        fieldMappings: [
          { input: 'partnerRate', storesTo: 'form.supplier_rate → trips.supplier_rate' },
          { input: 'advancePaid', storesTo: 'form.advance_paid → trips.advance_paid + ledger on submit' },
        ],
        queries: [
          {
            label: 'No DB write',
            when: 'Form state until submit',
            sql: '-- advance_paid > 0 → createLedgerEntry(contact_type=supplier) after INSERT',
          },
        ],
      },
      {
        id: 'bu-alloc-agg-phone',
        order: 3,
        label: 'Phone',
        title: 'Driver phone',
        subtitle: 'driverPhone sub-step · searchExistingDriversByPhone',
        route: '/add-trip',
        screen: `${SUPPLY_SHELL} · driverPhone sub-step`,
        phase: 'ui',
        reads: ['drivers', 'getDriverAvailabilityByPhoneGlobal'],
        fieldMappings: [
          { input: 'driverPhone', storesTo: 'options.driverPhone → assignTripDriverByPhone after create' },
          { input: 'driverConfirm', storesTo: 'UI confirm when name recommendations shown' },
        ],
        queries: [
          {
            label: 'Phone lookup',
            when: 'Debounced search while typing',
            sql: `SELECT id, name, phone, user_id, organization_id
FROM public.drivers
WHERE phone = :normalized_phone
LIMIT 10;
-- searchExistingDriversByPhone · getDriverAvailabilityByPhoneGlobal`,
          },
        ],
        notes: ['Busy driver blocked before submit', 'Switch locks if phone + vehicle + confirm all set'],
      },
      {
        id: 'bu-alloc-agg-name',
        order: 4,
        label: 'Name',
        title: 'Driver name',
        subtitle: 'driverName sub-step',
        route: '/add-trip',
        screen: `${SUPPLY_SHELL} · driverName sub-step`,
        phase: 'ui',
        fieldMappings: [
          { input: 'driverName', storesTo: 'aggregateDriverName → assign_aggregate_trip_driver p_driver_name' },
        ],
        queries: [
          {
            label: 'No DB write',
            when: 'Wizard only — may update drivers.name on phone assign',
            sql: '-- Passed to assignAggregateTripDriverByPhone or ensureDriverRowByPhone',
          },
        ],
      },
      {
        id: 'bu-alloc-agg-vehicle',
        order: 5,
        label: 'Vehicle',
        title: 'Vehicle number',
        subtitle: 'vehicle sub-step · Indian format',
        route: '/add-trip',
        screen: `${SUPPLY_SHELL} · vehicle sub-step`,
        phase: 'ui',
        fieldMappings: [
          { input: 'vehicleNumber', storesTo: 'form.vehicle_display_number → trips.vehicle_display_number' },
        ],
        queries: [
          {
            label: 'On INSERT',
            when: 'createTripWithOtp includes vehicle_display_number when set',
            sql: '-- vehicle_display_number on trips INSERT (aggregate path)',
          },
        ],
      },
    ],
  },
  {
    id: 'alloc-aggregate-later',
    label: 'Aggregate · assign later',
    badge: 'aggregate',
    summary: 'Supply (mode bar ON + partner inline) → rates only',
    steps: [
      {
        id: 'bu-alloc-agg-later-supply',
        order: 1,
        label: 'Supply',
        title: 'Supply · aggregate · assign later',
        subtitle: 'Assign later Switch ON + partner inline — same sub-step as assign-now',
        route: '/add-trip',
        screen: `${SUPPLY_SHELL} · ${MODE_BAR} · TripPartnerPickerSection`,
        phase: 'ui',
        reads: ['suppliers'],
        fieldMappings: [
          { input: 'supplySource (Aggregate chip)', storesTo: 'aggregate' },
          {
            input: 'assignLater (Switch ON)',
            storesTo: 'true — skips driverPhone · driverName · vehicle substeps',
          },
          { input: 'partner', storesTo: 'trips.supplier_id' },
        ],
        queries: [
          {
            label: 'Supplier roster',
            when: 'Partner inline on supply — assignLater=true',
            sql: `SELECT id, name FROM public.suppliers WHERE organization_id = :org_id;`,
          },
        ],
        notes: [
          'UI label: “Assign later” · subtitle: “Add vehicle & driver phone on trip detail”',
          'Warning when ON: “Add vehicle number and driver phone on the trip screen before the trip starts.”',
          'Switch disabled when phone + vehicle + driver confirm already filled',
        ],
      },
      {
        id: 'bu-alloc-agg-later-rates',
        order: 2,
        label: 'Rates',
        title: 'Partner rate & advance',
        subtitle: 'rates sub-step — last wizard sub-step when assignLater=true',
        route: '/add-trip',
        screen: `${SUPPLY_SHELL} · rates sub-step`,
        phase: 'ui',
        fieldMappings: [
          { input: 'partnerRate', storesTo: 'trips.supplier_rate' },
          { input: 'advancePaid', storesTo: 'trips.advance_paid' },
        ],
        queries: [
          {
            label: 'Sub-step list',
            when: 'getAllocationSubSteps aggregate + assignLater',
            sql: `-- Wizard substeps: supply → rates only
-- (no driverPhone, driverName, vehicle)`,
          },
        ],
        routing: [
          {
            context: 'Post-create',
            track: 'assign',
            nextScreen: '/trip/[id]/assignment · TripPhoneAssignmentWizard',
          },
        ],
      },
    ],
  },
];

export function createTripAllocationBranchIds(): string[] {
  return businessCreateTripAllocationBranches.map((b) => b.id);
}

export function createTripAllocationStepCount(): number {
  return businessCreateTripAllocationBranches.reduce((n, b) => n + b.steps.length, 0);
}
