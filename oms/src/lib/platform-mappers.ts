import type { Customer, Product, Warehouse } from '@/types/commerce';
import type {
  PlatformCustomer,
  PlatformProduct,
  PlatformWarehouse,
} from '@pulse-platform/index';

export function platformCustomerToCommerce(customer: PlatformCustomer): Customer {
  return {
    id: customer.id,
    name: customer.legalName ?? customer.tradeName ?? customer.name,
    email: customer.email ?? '',
    phone: customer.phone,
    company: customer.tradeName ?? customer.name,
    gstin: customer.gstin ?? undefined,
    billing_address: {
      line1: customer.address ?? '',
      city: '',
      state: customer.state ?? '',
      pincode: '',
    },
    shipping_address: {
      line1: customer.address ?? '',
      city: '',
      state: customer.state ?? '',
      pincode: '',
    },
    total_orders: 0,
    total_spend: 0,
    created_at: customer.createdAt,
  };
}

export function platformWarehouseToCommerce(warehouse: PlatformWarehouse): Warehouse {
  return {
    id: warehouse.id,
    name: warehouse.name,
    code: warehouse.code ?? warehouse.id.slice(0, 6).toUpperCase(),
    address: {
      line1: warehouse.addressLine ?? warehouse.name,
      city: warehouse.city ?? '',
      state: warehouse.state ?? '',
      pincode: warehouse.pincode ?? '',
      lat: warehouse.latitude ?? undefined,
      lng: warehouse.longitude ?? undefined,
    },
    capacity_m3: warehouse.capacityTons ? warehouse.capacityTons * 1.2 : 0,
  };
}

export function platformProductToCommerce(product: PlatformProduct): Product {
  return {
    id: product.id,
    sku: product.sku,
    name: product.name,
    category: product.category as Product['category'],
    description: product.description ?? '',
    unit_price: product.unitPrice,
    weight_kg: product.weightKg,
    volume_m3: product.volumeM3,
    dimensions: {
      l: product.lengthCm ?? 0,
      w: product.widthCm ?? 0,
      h: product.heightCm ?? 0,
    },
    stock: 0,
    reserved: 0,
    threshold: 0,
    created_at: product.createdAt,
  };
}
