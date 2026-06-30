/** Capability-based licensing model — products expose capabilities, not flat feature lists. */

export type CommerceCapabilityId =
  | 'catalog'
  | 'inventory'
  | 'crm'
  | 'pricing'
  | 'orders'
  | 'planning';

export type FinanceCapabilityId =
  | 'ledger'
  | 'invoicing'
  | 'payables'
  | 'receivables'
  | 'wallet'
  | 'reconciliation';

export type NetworkCapabilityId =
  | 'marketplace'
  | 'carrier_network'
  | 'load_exchange'
  | 'bidding'
  | 'escrow';

export type AiCapabilityId =
  | 'planning_agent'
  | 'dispatch_agent'
  | 'finance_agent'
  | 'customer_agent'
  | 'driver_agent'
  | 'compliance_agent';

export interface PlatformCapability {
  id:          string;
  label:       string;
  description: string;
  enabled:     boolean;
  route?:      string;
}

export const COMMERCE_CAPABILITIES: PlatformCapability[] = [
  { id: 'catalog',   label: 'Catalog',   description: 'Product SKUs, categories, media',        enabled: true,  route: '/products' },
  { id: 'inventory', label: 'Inventory', description: 'Stock levels, warehouses, reservations', enabled: true,  route: '/warehouses' },
  { id: 'crm',       label: 'CRM',       description: 'Customers, SLAs, shipping profiles',   enabled: true,  route: '/customers' },
  { id: 'pricing',   label: 'Pricing',   description: 'Price lists, discounts, contracts',    enabled: false },
  { id: 'orders',    label: 'Orders',    description: 'Sales orders and ingestion',           enabled: true,  route: '/orders' },
  { id: 'planning',  label: 'Planning',  description: 'Execution plan builder and publish',   enabled: true,  route: '/execution-plans/build' },
];
