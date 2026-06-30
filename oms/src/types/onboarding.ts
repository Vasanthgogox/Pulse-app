import type { Customer, Product, Warehouse } from '@/types/commerce';

export type OnboardingStepId =
  | 'organization'
  | 'warehouse'
  | 'products'
  | 'inventory'
  | 'customer'
  | 'first_order'
  | 'complete';

export interface OrganizationProfile {
  id:             string;
  name:           string;
  legalName?:     string;
  industry?:      string;
  tenantId:       string;
  createdAt:      string;
}

export interface OrganizationBranch {
  id:             string;
  name:           string;
  city:           string;
  organizationId: string;
}

export interface FleetDriver {
  id:    string;
  name:  string;
  phone: string;
}

export interface FleetVehicle {
  id:    string;
  label: string;
  type:  string;
}

export interface OrganizationState {
  profile:          OrganizationProfile | null;
  branches:         OrganizationBranch[];
  warehouses:       Warehouse[];
  products:         Product[];
  customers:        Customer[];
  drivers:          FleetDriver[];
  vehicles:         FleetVehicle[];
  onboardingStep:   OnboardingStepId;
  onboardingDone:   boolean;
}

export const ONBOARDING_STEPS: { id: OnboardingStepId; label: string; description: string }[] = [
  { id: 'organization', label: 'Organization', description: 'Company profile and tenant' },
  { id: 'warehouse',    label: 'Warehouse',    description: 'First fulfillment location' },
  { id: 'products',     label: 'Products',     description: 'Catalog SKUs' },
  { id: 'inventory',    label: 'Inventory',    description: 'Stock levels per warehouse' },
  { id: 'customer',     label: 'Consignee',    description: 'Delivery recipient profile' },
  { id: 'first_order',  label: 'First order',  description: 'Canonical sales order' },
  { id: 'complete',     label: 'Ready',        description: 'Start using Commerce' },
];

export const EMPTY_ORGANIZATION: OrganizationState = {
  profile: null,
  branches: [],
  warehouses: [],
  products: [],
  customers: [],
  drivers: [],
  vehicles: [],
  onboardingStep: 'organization',
  onboardingDone: false,
};
