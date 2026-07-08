/**
 * Commerce adapters — UI types only; persistence is platform-owned.
 */
import {
  CustomerService,
  ProductService,
  WarehouseService,
} from '@pulse-platform/index';
import type { Customer, Product, Warehouse } from '@/types/commerce';
import {
  platformCustomerToCommerce,
  platformProductToCommerce,
  platformWarehouseToCommerce,
} from '@/lib/platform-mappers';

function requireWorkspaceId(organizationId: string | undefined): string {
  if (!organizationId) throw new Error('Workspace not loaded');
  return organizationId;
}

export async function fetchCustomers(organizationId: string): Promise<Customer[]> {
  const rows = await CustomerService.list(organizationId);
  return rows.map(platformCustomerToCommerce);
}

export async function createCustomer(
  organizationId: string,
  input: { name: string; phone: string; email?: string; gstin?: string; address?: string; trade_name?: string; state?: string },
): Promise<Customer> {
  const row = await CustomerService.create(organizationId, {
    name: input.name,
    phone: input.phone,
    email: input.email,
    gstin: input.gstin,
    address: input.address,
    tradeName: input.trade_name,
    state: input.state,
  });
  return platformCustomerToCommerce(row);
}

export async function updateCustomer(
  organizationId: string,
  customerId: string,
  patch: Partial<Customer>,
): Promise<Customer> {
  const address = patch.shipping_address ?? patch.billing_address;
  const row = await CustomerService.update(organizationId, customerId, {
    name: patch.legal_name ?? patch.name,
    legalName: patch.legal_name ?? patch.company ?? patch.name,
    tradeName: patch.company ?? patch.legal_name,
    phone: patch.phone,
    email: patch.email,
    gstin: patch.gstin,
    address: address
      ? [address.line1, address.city, address.state, address.pincode].filter(Boolean).join(', ')
      : undefined,
    state: address?.state,
  });
  return platformCustomerToCommerce(row);
}

export async function deleteCustomer(organizationId: string, customerId: string): Promise<void> {
  await CustomerService.delete(organizationId, customerId);
}

export async function fetchWarehouses(organizationId: string): Promise<Warehouse[]> {
  const rows = await WarehouseService.list(organizationId);
  return rows.map(platformWarehouseToCommerce);
}

export async function createWarehouse(
  organizationId: string,
  clientId: string,
  input: {
    name: string;
    address?: string;
    city?: string;
    state?: string;
    pincode?: string;
    latitude?: number;
    longitude?: number;
    capacity_tons?: number;
    warehouse_code?: string;
  },
): Promise<Warehouse> {
  const row = await WarehouseService.create(organizationId, {
    clientId,
    name: input.name,
    address: input.address,
    city: input.city,
    state: input.state,
    pincode: input.pincode,
    latitude: input.latitude,
    longitude: input.longitude,
    capacityTons: input.capacity_tons,
    warehouseCode: input.warehouse_code,
  });
  return platformWarehouseToCommerce(row);
}

export async function updateWarehouse(
  organizationId: string,
  warehouseId: string,
  patch: Partial<Warehouse>,
): Promise<Warehouse> {
  const row = await WarehouseService.update(organizationId, warehouseId, {
    name: patch.name,
    address: patch.address?.line1,
    city: patch.address?.city,
    state: patch.address?.state,
    pincode: patch.address?.pincode,
    latitude: patch.address?.lat,
    longitude: patch.address?.lng,
    capacityTons: patch.capacity_m3 != null ? patch.capacity_m3 / 1.2 : undefined,
    warehouseCode: patch.code,
  });
  return platformWarehouseToCommerce(row);
}

export async function deleteWarehouse(organizationId: string, warehouseId: string): Promise<void> {
  await WarehouseService.delete(organizationId, warehouseId);
}

export async function fetchProducts(organizationId: string): Promise<Product[]> {
  const rows = await ProductService.list(organizationId);
  return rows.map(platformProductToCommerce);
}

export async function createProduct(
  organizationId: string,
  input: Omit<Product, 'id' | 'stock' | 'reserved' | 'created_at'> & {
    uom?: string;
    hazmat?: boolean;
    fragile?: boolean;
    temperature_type?: string;
    tax_rate?: number;
    hsn_code?: string;
  },
): Promise<Product> {
  const row = await ProductService.create(organizationId, {
    sku: input.sku,
    name: input.name,
    description: input.description,
    category: input.category,
    uom: input.uom,
    unitPrice: input.unit_price,
    weightKg: input.weight_kg,
    volumeM3: input.volume_m3,
    lengthCm: input.dimensions?.l,
    widthCm: input.dimensions?.w,
    heightCm: input.dimensions?.h,
    hazmat: input.hazmat,
    fragile: input.fragile,
    temperatureType: input.temperature_type,
    hsnCode: input.hsn_code,
    taxRate: input.tax_rate,
  });
  return platformProductToCommerce(row);
}

export async function updateProduct(
  organizationId: string,
  productId: string,
  patch: Partial<Product> & {
    uom?: string;
    hazmat?: boolean;
    fragile?: boolean;
    temperature_type?: string;
    tax_rate?: number;
    hsn_code?: string;
  },
): Promise<Product> {
  const row = await ProductService.update(organizationId, productId, {
    sku: patch.sku,
    name: patch.name,
    description: patch.description,
    category: patch.category,
    uom: patch.uom,
    unitPrice: patch.unit_price,
    weightKg: patch.weight_kg,
    volumeM3: patch.volume_m3,
    lengthCm: patch.dimensions?.l,
    widthCm: patch.dimensions?.w,
    heightCm: patch.dimensions?.h,
    hazmat: patch.hazmat,
    fragile: patch.fragile,
    temperatureType: patch.temperature_type,
    hsnCode: patch.hsn_code,
    taxRate: patch.tax_rate,
  });
  return platformProductToCommerce(row);
}

export async function deleteProduct(organizationId: string, productId: string): Promise<void> {
  await ProductService.delete(organizationId, productId);
}

/** Ensures a client exists for warehouse creation (client_warehouses requires client_id). */
export async function ensureWarehouseClientId(
  organizationId: string | undefined,
  customers: Customer[],
  fallbackName: string,
): Promise<string> {
  const workspaceId = requireWorkspaceId(organizationId);
  if (customers.length > 0) return customers[0].id;
  const internal = await createCustomer(workspaceId, {
    name: `${fallbackName} — Fulfillment`,
    phone: '9000000000',
  });
  return internal.id;
}
