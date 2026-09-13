/** Quantity lives on commerce_inventory (per warehouse), not on the product catalog row. */

export type InventoryQtyPatch = {
  stock?: number;
  reserved?: number;
  threshold?: number;
};

export function hasInventoryQtyPatch(next: InventoryQtyPatch): boolean {
  return (
    next.stock !== undefined ||
    next.reserved !== undefined ||
    next.threshold !== undefined
  );
}

export function toInventoryUpsertPatch(next: InventoryQtyPatch): {
  available_qty?: number;
  reserved_qty?: number;
  reorder_level?: number;
} {
  const patch: {
    available_qty?: number;
    reserved_qty?: number;
    reorder_level?: number;
  } = {};
  if (next.stock !== undefined) patch.available_qty = next.stock;
  if (next.reserved !== undefined) patch.reserved_qty = next.reserved;
  if (next.threshold !== undefined) patch.reorder_level = next.threshold;
  return patch;
}
