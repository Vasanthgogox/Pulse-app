import type { OrganizationState } from '@/types/onboarding';

/** Commerce configuration — warehouses, catalog, consignees (not platform org). */
export function isCommerceSetupComplete(state: Pick<
  OrganizationState,
  'warehouses' | 'products' | 'customers' | 'onboardingDone'
>): boolean {
  if (state.onboardingDone) return true;
  return (
    state.warehouses.length > 0 &&
    state.products.length > 0 &&
    state.customers.length > 0
  );
}

export const COMMERCE_SETUP_STEPS = [
  { id: 'warehouse', label: 'Add a warehouse', href: '/warehouses', doneKey: 'warehouses' as const },
  { id: 'products', label: 'Add products to catalog', href: '/products', doneKey: 'products' as const },
  { id: 'customers', label: 'Add a consignee', href: '/customers', doneKey: 'customers' as const },
] as const;
