/**
 * @deprecated Use `@/lib/services/platform-master-data.service` or `@pulse-platform` directly.
 */
export {
  fetchProducts,
  createProduct,
} from '@/lib/services/platform-master-data.service';

// Inventory remains commerce-workflow scoped until platform inventory service ships.
export {
  fetchInventory,
  upsertInventory,
  type InventoryRow,
} from './products.inventory';
