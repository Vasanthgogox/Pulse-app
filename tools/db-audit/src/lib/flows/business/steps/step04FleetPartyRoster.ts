import type { FlowBranch, FlowStep } from '@/lib/flowStep.types';
import {
  CLIENT_INSERT,
  DRIVER_OFFLINE_INSERT,
  ORG_RESOLVE_FOR_USER,
  SUPPLIER_OFFLINE_INSERT,
  VEHICLE_INSERT,
} from '@/lib/flows/shared/sqlSnippets';

export const businessFleetPartyRosterBranches: FlowBranch[] = [
  {
    id: 'roster-customer',
    label: 'Customer',
    badge: 'party',
    summary: 'AddClientModal — quick-add billing party',
    steps: [
      {
        id: 'bu-roster-customer-form',
        order: 1,
        label: 'Form',
        title: 'Customer details',
        subtitle: 'AddClientModal — single screen (party directory or Finance)',
        route: '/party/customers',
        screen: 'AddClientModal',
        phase: 'ui',
        reads: ['get_invitee_by_phone (optional platform match)'],
        fieldMappings: [
          { input: 'organizationName', storesTo: 'clients.name (display)' },
          { input: 'contactPerson', storesTo: 'clients.contact_person · fallback for name' },
          { input: 'phone', storesTo: 'clients.phone' },
        ],
        queries: [
          {
            label: 'Phone lookup (optional)',
            when: 'Debounced — connection invite path',
            sql: `-- get_invitee_by_phone → may block offline add if driver registered`,
          },
        ],
        notes: ['Import from contacts fills contactPerson + phone'],
      },
      {
        id: 'bu-roster-customer-save',
        order: 2,
        label: 'Save',
        title: 'INSERT customer',
        subtitle: 'clients.service createClient → CustomerService.createClientRecord',
        service: 'clients.service createClient',
        phase: 'post-auth',
        tables: ['clients'],
        fieldMappings: [
          { input: 'organization_id', storesTo: 'clients.organization_id (session org)' },
          { input: 'name', storesTo: 'clients.name' },
          { input: 'phone', storesTo: 'clients.phone' },
          { input: 'email', storesTo: 'clients.email (optional)' },
          { input: 'gstin', storesTo: 'clients.gstin (web/full form)' },
          { input: 'created_by', storesTo: 'clients.created_by → auth.uid()' },
        ],
        queries: [
          {
            label: 'INSERT',
            when: 'AddClientModal submit',
            sql: `${ORG_RESOLVE_FOR_USER}

${CLIENT_INSERT}`,
          },
        ],
      },
    ],
  },
  {
    id: 'roster-supplier',
    label: 'Supplier',
    badge: 'party',
    summary: 'AddSupplierModal — offline partner (supplier_type=offline)',
    steps: [
      {
        id: 'bu-roster-supplier-form',
        order: 1,
        label: 'Form',
        title: 'Supplier details',
        subtitle: 'AddSupplierModal — name, company, phone',
        route: '/party/suppliers',
        screen: 'AddSupplierModal',
        phase: 'ui',
        reads: ['get_invitee_by_phone (optional)'],
        fieldMappings: [
          { input: 'name', storesTo: 'suppliers.name (contact display)' },
          { input: 'companyName', storesTo: 'suppliers.name (canonical if set)' },
          { input: 'phone', storesTo: 'suppliers.phone' },
        ],
      },
      {
        id: 'bu-roster-supplier-save',
        order: 2,
        label: 'Save',
        title: 'INSERT supplier',
        service: 'suppliers.service createSupplier',
        phase: 'post-auth',
        tables: ['suppliers'],
        fieldMappings: [
          { input: 'organization_id', storesTo: 'suppliers.organization_id' },
          { input: 'name', storesTo: 'suppliers.name' },
          { input: 'phone', storesTo: 'suppliers.phone' },
          { input: 'supplier_type', storesTo: "suppliers.supplier_type = 'offline'" },
          { input: 'is_active', storesTo: 'suppliers.is_active = true' },
          { input: 'is_verified', storesTo: 'suppliers.is_verified = false' },
        ],
        queries: [
          {
            label: 'INSERT offline supplier',
            when: 'Modal submit',
            sql: SUPPLIER_OFFLINE_INSERT,
          },
        ],
      },
    ],
  },
  {
    id: 'roster-driver',
    label: 'Driver',
    badge: 'party',
    summary: 'AddDriverModal wizard — roster row status offline',
    steps: [
      {
        id: 'bu-roster-driver-info',
        order: 1,
        label: 'Info',
        title: 'Driver info',
        subtitle: 'Wizard step 1 — source, name, phone',
        route: '/party/drivers',
        screen: 'AddDriverModal · WizardStepLayout',
        phase: 'ui',
        reads: ['searchExistingDriversByPhone'],
        fieldMappings: [
          { input: 'driverSource', storesTo: 'Form only (organization | partner)' },
          { input: 'name', storesTo: 'drivers.name' },
          { input: 'phone', storesTo: 'drivers.phone' },
        ],
      },
      {
        id: 'bu-roster-driver-contact',
        order: 2,
        label: 'Contact',
        title: 'Contact',
        subtitle: 'Wizard step 2 — email & emergency',
        phase: 'ui',
        fieldMappings: [
          { input: 'email', storesTo: 'drivers.email' },
          { input: 'emergencyContact', storesTo: 'drivers metadata / profile (if persisted)' },
          { input: 'emergencyName', storesTo: 'drivers metadata (if persisted)' },
        ],
      },
      {
        id: 'bu-roster-driver-docs',
        order: 3,
        label: 'DL',
        title: 'Documents',
        subtitle: 'Wizard step 3 — driving licence number',
        phase: 'ui',
        fieldMappings: [{ input: 'licenseNumber', storesTo: 'drivers.license_number (or docs JSON)' }],
      },
      {
        id: 'bu-roster-driver-pay',
        order: 4,
        label: 'Pay',
        title: 'Compensation',
        subtitle: 'Wizard step 4 — optional salary / commission',
        phase: 'ui',
        fieldMappings: [
          { input: 'payableAmount', storesTo: 'drivers.payable_amount' },
          { input: 'commissionPercent', storesTo: 'drivers.commission_percent' },
          { input: 'commissionPerKm', storesTo: 'drivers.commission_per_km' },
        ],
      },
      {
        id: 'bu-roster-driver-save',
        order: 5,
        label: 'Save',
        title: 'INSERT driver',
        subtitle: 'Review → Add driver (offline roster)',
        service: 'drivers.service createDriver',
        phase: 'post-auth',
        tables: ['drivers'],
        fieldMappings: [
          { input: 'organization_id', storesTo: 'drivers.organization_id' },
          { input: 'status', storesTo: "drivers.status = 'offline'" },
          { input: 'name · phone · email', storesTo: 'drivers columns' },
          { input: 'payable_amount', storesTo: 'drivers.payable_amount' },
          { input: 'commission_percent', storesTo: 'drivers.commission_percent' },
          { input: 'commission_per_km', storesTo: 'drivers.commission_per_km' },
        ],
        queries: [
          {
            label: 'INSERT or reconnect',
            when: 'onAddDriver on review step',
            sql: DRIVER_OFFLINE_INSERT,
          },
        ],
        notes: ['Send invitation path uses onComplete — separate from offline INSERT'],
      },
    ],
  },
  {
    id: 'roster-vehicle',
    label: 'Vehicle',
    badge: 'party',
    summary: 'AddVehicleModal wizard — owned or partner truck',
    steps: [
      {
        id: 'bu-roster-vehicle-info',
        order: 1,
        label: 'Info',
        title: 'Vehicle info',
        subtitle: 'Wizard step 1 — number, category, body, capacity',
        route: '/party/vehicles',
        screen: 'AddVehicleModal',
        phase: 'ui',
        fieldMappings: [
          { input: 'vehicleSource', storesTo: "vehicles.type → owned | adhoc (partner)" },
          { input: 'vehicleNumber', storesTo: 'vehicles.vehicle_number' },
          { input: 'vehicleCategory', storesTo: 'vehicles.vehicle_type' },
          { input: 'bodyType', storesTo: 'vehicles.vehicle_body_type' },
          { input: 'capacity', storesTo: 'vehicles.capacity' },
          { input: 'bodyLength / axle', storesTo: 'vehicles.vehicle_size · vehicle_axle' },
        ],
      },
      {
        id: 'bu-roster-vehicle-docs',
        order: 2,
        label: 'Docs',
        title: 'Document expiry',
        subtitle: 'Wizard step 2 — JSON expiry map (full flow)',
        phase: 'ui',
        fieldMappings: [
          { input: 'expiryDates (RC, insurance, …)', storesTo: 'vehicles.documents (jsonb)' },
        ],
        notes: ['Skipped when ownAssetOnly (Garage quick-add)'],
      },
      {
        id: 'bu-roster-vehicle-save',
        order: 3,
        label: 'Save',
        title: 'INSERT vehicle',
        service: 'vehicles.service createVehicle',
        phase: 'post-auth',
        tables: ['vehicles'],
        fieldMappings: [
          { input: 'organization_id', storesTo: 'vehicles.organization_id' },
          { input: 'status', storesTo: "vehicles.status = 'active'" },
          { input: 'vehicle_number', storesTo: 'vehicles.vehicle_number (unique per org)' },
          { input: 'documents', storesTo: 'vehicles.documents' },
        ],
        queries: [
          {
            label: 'INSERT',
            when: 'Review step confirm',
            sql: VEHICLE_INSERT,
          },
        ],
      },
    ],
  },
];

export function fleetPartyRosterBranchIds(): string[] {
  return businessFleetPartyRosterBranches.map((b) => b.id);
}

export function fleetPartyRosterStepCount(): number {
  return businessFleetPartyRosterBranches.reduce((n, b) => n + b.steps.length, 0);
}

/** Flat list for findStep */
export const businessFleetPartyRosterSteps: FlowStep[] = businessFleetPartyRosterBranches.flatMap(
  (b) => b.steps,
);
