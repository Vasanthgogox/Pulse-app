import { getIdentityDb as getSupabase } from '@/lib/supabase';

export interface InventoryRow {
  id: string;
  organization_id: string;
  product_id: string;
  warehouse_id: string;
  available_qty: number;
  reserved_qty: number;
  damaged_qty: number;
  reorder_level: number;
  last_adjusted_at: string;
}

export async function fetchInventory(organizationId: string): Promise<InventoryRow[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data, error } = await sb
    .from('commerce_inventory')
    .select('*')
    .eq('organization_id', organizationId)
    .order('last_adjusted_at', { ascending: false });
  if (error) throw error;
  return data as InventoryRow[];
}

export async function upsertInventory(
  organizationId: string,
  productId: string,
  warehouseId: string,
  patch: { available_qty?: number; reserved_qty?: number; damaged_qty?: number; reorder_level?: number },
): Promise<void> {
  const sb = getSupabase();
  if (!sb) throw new Error('Supabase not configured');
  const { error } = await sb
    .from('commerce_inventory')
    .upsert(
      {
        organization_id: organizationId,
        product_id: productId,
        warehouse_id: warehouseId,
        ...patch,
        last_adjusted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'product_id,warehouse_id' },
    );
  if (error) throw error;
}
