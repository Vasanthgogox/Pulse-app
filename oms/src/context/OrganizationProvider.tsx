import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { Customer, Product, Warehouse } from '@/types/commerce';
import type {
  FleetDriver, FleetVehicle, OnboardingStepId, OrganizationProfile, OrganizationState,
} from '@/types/onboarding';
import { ONBOARDING_STEPS } from '@/types/onboarding';
import { EMPTY_ORGANIZATION } from '@/types/onboarding';
import { loadOnboardingState, saveOnboardingState } from '@/lib/organization-store';
import {
  CustomerService,
  ProductService,
  WarehouseService,
} from '@pulse-platform/index';
import {
  platformCustomerToCommerce,
  platformProductToCommerce,
  platformWarehouseToCommerce,
} from '@/lib/platform-mappers';
import {
  createCustomer as createCustomerRecord,
  createProduct as createProductRecord,
  createWarehouse as createWarehouseRecord,
  deleteCustomer as deleteCustomerRecord,
  deleteProduct as deleteProductRecord,
  deleteWarehouse as deleteWarehouseRecord,
  ensureWarehouseClientId,
  updateCustomer as updateCustomerRecord,
  updateProduct as updateProductRecord,
  updateWarehouse as updateWarehouseRecord,
} from '@/lib/services/platform-master-data.service';
import { upsertInventory, fetchInventory } from '@/lib/services/products.inventory';
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
  masterDataLoading: boolean;
  masterDataMutating: boolean;
  masterDataError: string | null;
  refreshMasterData: () => Promise<void>;
  setProfile: (profile: OrganizationProfile) => void;
  createWarehouse: (warehouse: Omit<Warehouse, 'id'>) => Promise<Warehouse | null>;
  updateWarehouse: (id: string, patch: Partial<Warehouse>) => Promise<void>;
  deleteWarehouse: (id: string) => Promise<void>;
  createProduct: (product: Omit<Product, 'id' | 'stock' | 'reserved' | 'created_at'>) => Promise<Product | null>;
  updateProduct: (id: string, patch: Partial<Product>) => Promise<void>;
  deleteProduct: (id: string) => Promise<void>;
  setProductStock: (productId: string, stock: number) => Promise<void>;
  createCustomer: (
    customer: Omit<Customer, 'id' | 'total_orders' | 'total_spend' | 'created_at'>,
  ) => Promise<Customer | null>;
  updateCustomer: (id: string, patch: Partial<Customer>) => Promise<void>;
  deleteCustomer: (id: string) => Promise<void>;
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
  const [state, setState] = useState<OrganizationState>(() => ({
    ...EMPTY_ORGANIZATION,
    ...loadOnboardingState(),
  }));
  const [organizationHydrated, setOrganizationHydrated] = useState(false);
  const [masterDataLoading, setMasterDataLoading] = useState(false);
  const [masterDataMutating, setMasterDataMutating] = useState(false);
  const [platformOrganization, setPlatformOrganization] = useState<PlatformOrganization | null>(null);
  const [commerceSetupComplete, setCommerceSetupComplete] = useState(false);
  const [masterDataError, setMasterDataError] = useState<string | null>(null);

  const workspaceId = platformOrganization?.id;

  const persistOnboarding = useCallback((updater: (prev: OrganizationState) => OrganizationState) => {
    setState((prev) => {
      const next = updater(prev);
      saveOnboardingState({
        onboardingStep: next.onboardingStep,
        onboardingDone: next.onboardingDone,
      });
      return next;
    });
  }, []);

  const hydrateMasterData = useCallback(async (orgId: string) => {
    setMasterDataLoading(true);
    setMasterDataError(null);
    try {
      const [customers, warehouses, products, inventory] = await Promise.all([
        CustomerService.list(orgId),
        WarehouseService.list(orgId),
        ProductService.list(orgId),
        fetchInventory(orgId),
      ]);
      const inventoryByProduct = new Map(
        inventory.map((row) => [row.product_id, row]),
      );
      setState((prev) => ({
        ...prev,
        customers: customers.map(platformCustomerToCommerce),
        warehouses: warehouses.map(platformWarehouseToCommerce),
        products: products.map((product) => {
          const commerce = platformProductToCommerce(product);
          const stockRow = inventoryByProduct.get(product.id);
          if (!stockRow) return commerce;
          return {
            ...commerce,
            stock: stockRow.available_qty,
            reserved: stockRow.reserved_qty,
            threshold: stockRow.reorder_level,
          };
        }),
      }));
      setCommerceSetupComplete(
        customers.length > 0 && warehouses.length > 0 && products.length > 0,
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to load workspace master data';
      setMasterDataError(message);
      throw e;
    } finally {
      setMasterDataLoading(false);
    }
  }, []);

  const refreshMasterData = useCallback(async () => {
    if (!workspaceId) return;
    await hydrateMasterData(workspaceId);
  }, [hydrateMasterData, workspaceId]);

  const runMutation = useCallback(async <T,>(fn: () => Promise<T>): Promise<T> => {
    setMasterDataMutating(true);
    try {
      return await fn();
    } finally {
      setMasterDataMutating(false);
    }
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
      const delayMs = Number(import.meta.env.VITE_OMS_DEV_HYDRATION_DELAY_MS || 0);
      if (delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }

      const resolvedOrg = await getPrimaryOrganizationForUser(user.id);
      if (cancelled) return;

      setPlatformOrganization(resolvedOrg);

      if (resolvedOrg) {
        setState((prev) => ({
          ...prev,
          profile: {
            id: resolvedOrg.id,
            name: resolvedOrg.name,
            tenantId: prev.profile?.tenantId ?? DEFAULT_TENANT.tenantId,
            createdAt: prev.profile?.createdAt ?? new Date().toISOString(),
          },
        }));
        try {
          await hydrateMasterData(resolvedOrg.id);
        } catch {
          // Error surfaced via masterDataError; still unblock the shell.
        }
      }

      setOrganizationHydrated(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [authLoading, hydrateMasterData, user?.id]);

  const setProfile = useCallback((profile: OrganizationProfile) => {
    persistOnboarding((prev) => ({ ...prev, profile, onboardingStep: 'warehouse' }));
  }, [persistOnboarding]);

  const createWarehouse = useCallback(async (warehouse: Omit<Warehouse, 'id'>): Promise<Warehouse | null> => {
    if (!workspaceId) return null;
    return runMutation(async () => {
      const clientId = await ensureWarehouseClientId(
        workspaceId,
        state.customers,
        state.profile?.name ?? 'Workspace',
      );
      const created = await createWarehouseRecord(workspaceId, clientId, {
        name: warehouse.name,
        address: warehouse.address.line1,
        city: warehouse.address.city,
        state: warehouse.address.state,
        pincode: warehouse.address.pincode,
        latitude: warehouse.address.lat,
        longitude: warehouse.address.lng,
        capacity_tons: warehouse.capacity_m3 / 1.2,
        warehouse_code: warehouse.code,
      });
      await refreshMasterData();
      persistOnboarding((prev) => ({
        ...prev,
        onboardingStep: prev.products.length ? prev.onboardingStep : 'products',
      }));
      return created;
    });
  }, [workspaceId, runMutation, state.customers, state.profile?.name, refreshMasterData, persistOnboarding]);

  const updateWarehouse = useCallback(async (id: string, patch: Partial<Warehouse>) => {
    if (!workspaceId) return;
    await runMutation(async () => {
      await updateWarehouseRecord(workspaceId, id, patch);
      await refreshMasterData();
    });
  }, [workspaceId, runMutation, refreshMasterData]);

  const deleteWarehouse = useCallback(async (id: string) => {
    if (!workspaceId) return;
    await runMutation(async () => {
      await deleteWarehouseRecord(workspaceId, id);
      await refreshMasterData();
    });
  }, [workspaceId, runMutation, refreshMasterData]);

  const createProduct = useCallback(async (
    product: Omit<Product, 'id' | 'stock' | 'reserved' | 'created_at'>,
  ): Promise<Product | null> => {
    if (!workspaceId) return null;
    return runMutation(async () => {
      const created = await createProductRecord(workspaceId, product);
      await refreshMasterData();
      persistOnboarding((prev) => ({ ...prev, onboardingStep: 'inventory' }));
      return created;
    });
  }, [workspaceId, runMutation, refreshMasterData, persistOnboarding]);

  const updateProduct = useCallback(async (id: string, patch: Partial<Product>) => {
    if (!workspaceId) return;
    await runMutation(async () => {
      const { stock, reserved, threshold, ...catalogPatch } = patch;
      if (Object.keys(catalogPatch).length > 0) {
        await updateProductRecord(workspaceId, id, catalogPatch);
      }
      const warehouseId = state.warehouses[0]?.id;
      if (warehouseId && (stock !== undefined || reserved !== undefined || threshold !== undefined)) {
        await upsertInventory(workspaceId, id, warehouseId, {
          available_qty: stock,
          reserved_qty: reserved,
          reorder_level: threshold,
        });
      }
      await refreshMasterData();
    });
  }, [workspaceId, state.warehouses, runMutation, refreshMasterData]);

  const deleteProduct = useCallback(async (id: string) => {
    if (!workspaceId) return;
    await runMutation(async () => {
      await deleteProductRecord(workspaceId, id);
      await refreshMasterData();
    });
  }, [workspaceId, runMutation, refreshMasterData]);

  const setProductStock = useCallback(async (productId: string, stock: number) => {
    if (!workspaceId) return;
    const warehouseId = state.warehouses[0]?.id;
    await runMutation(async () => {
      if (warehouseId) {
        await upsertInventory(workspaceId, productId, warehouseId, { available_qty: stock });
      }
      await refreshMasterData();
      persistOnboarding((prev) => ({
        ...prev,
        onboardingStep: prev.customers.length ? prev.onboardingStep : 'customer',
      }));
    });
  }, [workspaceId, state.warehouses, runMutation, refreshMasterData, persistOnboarding]);

  const createCustomer = useCallback(async (
    customer: Omit<Customer, 'id' | 'total_orders' | 'total_spend' | 'created_at'>,
  ): Promise<Customer | null> => {
    if (!workspaceId) return null;
    return runMutation(async () => {
      const address = customer.shipping_address;
      const created = await createCustomerRecord(workspaceId, {
        name: customer.legal_name ?? customer.name,
        phone: customer.phone || '9000000000',
        email: customer.email,
        gstin: customer.gstin,
        trade_name: customer.company ?? customer.legal_name,
        address: [address.line1, address.city, address.state, address.pincode].filter(Boolean).join(', '),
        state: address.state,
      });
      await refreshMasterData();
      persistOnboarding((prev) => ({ ...prev, onboardingStep: 'first_order' }));
      return created;
    });
  }, [workspaceId, runMutation, refreshMasterData, persistOnboarding]);

  const updateCustomer = useCallback(async (id: string, patch: Partial<Customer>) => {
    if (!workspaceId) return;
    await runMutation(async () => {
      await updateCustomerRecord(workspaceId, id, patch);
      await refreshMasterData();
    });
  }, [workspaceId, runMutation, refreshMasterData]);

  const deleteCustomer = useCallback(async (id: string) => {
    if (!workspaceId) return;
    await runMutation(async () => {
      await deleteCustomerRecord(workspaceId, id);
      await refreshMasterData();
    });
  }, [workspaceId, runMutation, refreshMasterData]);

  const addDriver = useCallback((driver: FleetDriver) => {
    setState((prev) => ({ ...prev, drivers: [...prev.drivers, driver] }));
  }, []);

  const addVehicle = useCallback((vehicle: FleetVehicle) => {
    setState((prev) => ({ ...prev, vehicles: [...prev.vehicles, vehicle] }));
  }, []);

  const advanceOnboarding = useCallback((step: OnboardingStepId) => {
    persistOnboarding((prev) => ({ ...prev, onboardingStep: step }));
  }, [persistOnboarding]);

  const completeOnboarding = useCallback(() => {
    persistOnboarding((prev) => ({ ...prev, onboardingDone: true, onboardingStep: 'complete' }));
  }, [persistOnboarding]);

  const currentStepIndex = ONBOARDING_STEPS.findIndex((s) => s.id === state.onboardingStep);
  const hasPlatformOrganization = platformOrganization != null;
  const canAccessCommerce = hasPlatformOrganization;

  const value = useMemo(() => ({
    ...state,
    organizationHydrated,
    platformOrganization,
    hasPlatformOrganization,
    commerceSetupComplete,
    masterDataLoading,
    masterDataMutating,
    masterDataError,
    refreshMasterData,
    setProfile,
    createWarehouse,
    updateWarehouse,
    deleteWarehouse,
    createProduct,
    updateProduct,
    deleteProduct,
    setProductStock,
    createCustomer,
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
    masterDataLoading, masterDataMutating, masterDataError, refreshMasterData,
    setProfile, createWarehouse, updateWarehouse, deleteWarehouse,
    createProduct, updateProduct, deleteProduct, setProductStock,
    createCustomer, updateCustomer, deleteCustomer, addDriver, addVehicle, advanceOnboarding, completeOnboarding,
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
