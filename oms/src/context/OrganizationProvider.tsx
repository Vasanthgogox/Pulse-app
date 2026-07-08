import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { Customer, Product, Warehouse } from '@/types/commerce';
import type {
  FleetDriver, FleetVehicle, OnboardingStepId, OrganizationProfile, OrganizationState,
} from '@/types/onboarding';
import { ONBOARDING_STEPS } from '@/types/onboarding';
import { loadOrganizationState, saveOrganizationState } from '@/lib/organization-store';
import { isCommerceSetupComplete } from '@/lib/commerce-setup';
import {
  getPrimaryOrganizationForUser,
  type PlatformOrganization,
} from '@/lib/services/identity-organization.service';
import { useAuth } from '@/context/AuthProvider';
import { DEFAULT_TENANT } from '@/types/platform';

interface OrganizationContextValue extends OrganizationState {
  organizationHydrated: boolean;
  platformOrganization: PlatformOrganization | null;
  hasPlatformOrganization: boolean;
  commerceSetupComplete: boolean;
  setProfile: (profile: OrganizationProfile) => void;
  addWarehouse: (warehouse: Warehouse) => void;
  updateWarehouse: (id: string, patch: Partial<Warehouse>) => void;
  deleteWarehouse: (id: string) => void;
  addProduct: (product: Product) => void;
  updateProduct: (id: string, patch: Partial<Product>) => void;
  deleteProduct: (id: string) => void;
  setProductStock: (productId: string, stock: number) => void;
  addCustomer: (customer: Customer) => void;
  updateCustomer: (id: string, patch: Partial<Customer>) => void;
  deleteCustomer: (id: string) => void;
  addDriver: (driver: FleetDriver) => void;
  addVehicle: (vehicle: FleetVehicle) => void;
  advanceOnboarding: (step: OnboardingStepId) => void;
  completeOnboarding: () => void;
  currentStepIndex: number;
  canAccessCommerce: boolean;
}

const OrganizationContext = createContext<OrganizationContextValue | undefined>(undefined);

export function OrganizationProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [state, setState] = useState<OrganizationState>(() => loadOrganizationState());
  const [organizationHydrated, setOrganizationHydrated] = useState(false);
  const [platformOrganization, setPlatformOrganization] = useState<PlatformOrganization | null>(null);

  const persist = useCallback((updater: (prev: OrganizationState) => OrganizationState) => {
    setState(prev => {
      const next = updater(prev);
      saveOrganizationState(next);
      return next;
    });
  }, []);

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      setPlatformOrganization(null);
      setOrganizationHydrated(true);
      return;
    }

    let cancelled = false;
    setOrganizationHydrated(false);

    void (async () => {
      const resolvedOrg = await getPrimaryOrganizationForUser(user.id);
      if (cancelled) return;

      setPlatformOrganization(resolvedOrg);

      if (resolvedOrg) {
        persist(prev => ({
          ...prev,
          profile: {
            id: resolvedOrg.id,
            name: resolvedOrg.name,
            tenantId: prev.profile?.tenantId ?? DEFAULT_TENANT.tenantId,
            createdAt: prev.profile?.createdAt ?? new Date().toISOString(),
          },
        }));
      }

      setOrganizationHydrated(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [authLoading, persist, user?.id]);

  const setProfile = useCallback((profile: OrganizationProfile) => {
    persist(prev => ({ ...prev, profile, onboardingStep: 'warehouse' }));
  }, [persist]);

  const addWarehouse = useCallback((warehouse: Warehouse) => {
    persist(prev => ({
      ...prev,
      warehouses: [...prev.warehouses, warehouse],
      onboardingStep: prev.products.length ? prev.onboardingStep : 'products',
    }));
  }, [persist]);

  const updateWarehouse = useCallback((id: string, patch: Partial<Warehouse>) => {
    persist(prev => ({
      ...prev,
      warehouses: prev.warehouses.map(w => w.id === id ? { ...w, ...patch } : w),
    }));
  }, [persist]);

  const deleteWarehouse = useCallback((id: string) => {
    persist(prev => ({ ...prev, warehouses: prev.warehouses.filter(w => w.id !== id) }));
  }, [persist]);

  const addProduct = useCallback((product: Product) => {
    persist(prev => ({ ...prev, products: [...prev.products, product], onboardingStep: 'inventory' }));
  }, [persist]);

  const updateProduct = useCallback((id: string, patch: Partial<Product>) => {
    persist(prev => ({
      ...prev,
      products: prev.products.map(p => p.id === id ? { ...p, ...patch } : p),
    }));
  }, [persist]);

  const deleteProduct = useCallback((id: string) => {
    persist(prev => ({ ...prev, products: prev.products.filter(p => p.id !== id) }));
  }, [persist]);

  const setProductStock = useCallback((productId: string, stock: number) => {
    persist(prev => ({
      ...prev,
      products: prev.products.map(p => p.id === productId ? { ...p, stock } : p),
      onboardingStep: prev.customers.length ? prev.onboardingStep : 'customer',
    }));
  }, [persist]);

  const addCustomer = useCallback((customer: Customer) => {
    persist(prev => ({ ...prev, customers: [...prev.customers, customer], onboardingStep: 'first_order' }));
  }, [persist]);

  const updateCustomer = useCallback((id: string, patch: Partial<Customer>) => {
    persist(prev => ({
      ...prev,
      customers: prev.customers.map(c => c.id === id ? { ...c, ...patch } : c),
    }));
  }, [persist]);

  const deleteCustomer = useCallback((id: string) => {
    persist(prev => ({ ...prev, customers: prev.customers.filter(c => c.id !== id) }));
  }, [persist]);

  const addDriver = useCallback((driver: FleetDriver) => {
    persist(prev => ({ ...prev, drivers: [...prev.drivers, driver] }));
  }, [persist]);

  const addVehicle = useCallback((vehicle: FleetVehicle) => {
    persist(prev => ({ ...prev, vehicles: [...prev.vehicles, vehicle] }));
  }, [persist]);

  const advanceOnboarding = useCallback((step: OnboardingStepId) => {
    persist(prev => ({ ...prev, onboardingStep: step }));
  }, [persist]);

  const completeOnboarding = useCallback(() => {
    persist(prev => ({ ...prev, onboardingDone: true, onboardingStep: 'complete' }));
  }, [persist]);

  const currentStepIndex = ONBOARDING_STEPS.findIndex(s => s.id === state.onboardingStep);
  const hasPlatformOrganization = platformOrganization != null;
  const commerceSetupComplete = isCommerceSetupComplete(state);
  const canAccessCommerce = hasPlatformOrganization;

  const value = useMemo(() => ({
    ...state,
    organizationHydrated,
    platformOrganization,
    hasPlatformOrganization,
    commerceSetupComplete,
    setProfile,
    addWarehouse,
    updateWarehouse,
    deleteWarehouse,
    addProduct,
    updateProduct,
    deleteProduct,
    setProductStock,
    addCustomer,
    updateCustomer,
    deleteCustomer,
    addDriver,
    addVehicle,
    advanceOnboarding,
    completeOnboarding,
    currentStepIndex,
    canAccessCommerce,
  }), [
    state, organizationHydrated, platformOrganization, hasPlatformOrganization, commerceSetupComplete,
    setProfile, addWarehouse, updateWarehouse, deleteWarehouse,
    addProduct, updateProduct, deleteProduct, setProductStock,
    addCustomer, updateCustomer, deleteCustomer, addDriver, addVehicle, advanceOnboarding, completeOnboarding,
    currentStepIndex, canAccessCommerce,
  ]);

  return (
    <OrganizationContext.Provider value={value}>
      {children}
    </OrganizationContext.Provider>
  );
}

export function useOrganization(): OrganizationContextValue {
  const ctx = useContext(OrganizationContext);
  if (!ctx) throw new Error('useOrganization must be used inside OrganizationProvider');
  return ctx;
}

export function createDefaultProfile(name: string): OrganizationProfile {
  return {
    id: `org-${crypto.randomUUID().slice(0, 8)}`,
    name,
    tenantId: DEFAULT_TENANT.tenantId,
    createdAt: new Date().toISOString(),
  };
}
