import { getIdentityDb as getSupabase } from '@/lib/supabase';
import type { Product } from '@/types/commerce';

// ─── DB row shape ────────────────────────────────────────────────────────────
interface ProductRow {
  id: string;
  organization_id: string;
  sku: string;
  name: string;
  description: string | null;
  category: string;
  uom: string;
  unit_price: number;
  weight_kg: number;
  volume_m3: number;
  length_cm: number | null;
  width_cm: number | null;
  height_cm: number | null;
  hazmat: boolean;
  fragile: boolean;
  temperature_type: string;
  status: string;
  hsn_code: string | null;
  tax_rate: number;
  created_at: string;
  updated_at: string;
  inventory?: InventorySummary[];
}

interface InventorySummary {
  available_qty: number;
  reserved_qty: number;
  reorder_level: number;
}

function rowToProduct(row: ProductRow): Product {
  const inv = row.inventory ?? [];
  const totalAvailable = inv.reduce((s, i) => s + (i.available_qty ?? 0), 0);
  const totalReserved  = inv.reduce((s, i) => s + (i.reserved_qty  ?? 0), 0);
  const reorderLevel   = inv[0]?.reorder_level ?? 0;
  return {
    id:          row.id,
    sku:         row.sku,
    name:        row.name,
    category:    row.category as Product['category'],
    description: row.description ?? '',
    unit_price:  row.unit_price,
    weight_kg:   row.weight_kg,
    volume_m3:   row.volume_m3,
    dimensions:  { l: row.length_cm ?? 0, w: row.width_cm ?? 0, h: row.height_cm ?? 0 },
    stock:       totalAvailable,
    reserved:    totalReserved,
    threshold:   reorderLevel,
    created_at:  row.created_at,
  };
}

export async function fetchProducts(organizationId: string): Promise<Product[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data, error } = await sb
    .from('commerce_products')
    .select('*, inventory:commerce_inventory(available_qty,reserved_qty,reorder_level)')
    .eq('organization_id', organizationId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data as ProductRow[]).map(rowToProduct);
}

export async function createProduct(
  organizationId: string,
  input: Omit<Product, 'id' | 'stock' | 'reserved' | 'created_at'> & {
    uom?: string;
    hazmat?: boolean;
    fragile?: boolean;
    temperature_type?: string;
    status?: string;
    tax_rate?: number;
    hsn_code?: string;
  },
): Promise<Product> {
  const sb = getSupabase();
  if (!sb) throw new Error('Supabase not configured');
  const { data, error } = await sb
    .from('commerce_products')
    .insert({
      organization_id: organizationId,
      sku:             input.sku,
      name:            input.name,
      description:     input.description,
      category:        input.category,
      uom:             input.uom ?? 'unit',
      unit_price:      input.unit_price,
      weight_kg:       input.weight_kg,
      volume_m3:       input.volume_m3,
      length_cm:       input.dimensions?.l,
      width_cm:        input.dimensions?.w,
      height_cm:       input.dimensions?.h,
      hazmat:          input.hazmat ?? false,
      fragile:         input.fragile ?? false,
      temperature_type: input.temperature_type ?? 'ambient',
      status:          input.status ?? 'active',
      tax_rate:        input.tax_rate ?? 18,
      hsn_code:        input.hsn_code,
    })
    .select('*, inventory:commerce_inventory(available_qty,reserved_qty,reorder_level)')
    .single();
  if (error) throw error;
  return rowToProduct(data as ProductRow);
}

export async function updateProduct(
  id: string,
  patch: Partial<Pick<Product, 'name' | 'description' | 'unit_price' | 'weight_kg' | 'volume_m3' | 'category'>>
    & { status?: string; uom?: string; hazmat?: boolean; fragile?: boolean; tax_rate?: number },
): Promise<void> {
  const sb = getSupabase();
  if (!sb) throw new Error('Supabase not configured');
  const { error } = await sb
    .from('commerce_products')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function deleteProduct(id: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) throw new Error('Supabase not configured');
  const { error } = await sb
    .from('commerce_products')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

// ─── Inventory ───────────────────────────────────────────────────────────────

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
    .upsert({
      organization_id: organizationId,
      product_id:      productId,
      warehouse_id:    warehouseId,
      ...patch,
      last_adjusted_at: new Date().toISOString(),
      updated_at:       new Date().toISOString(),
    }, { onConflict: 'product_id,warehouse_id' });
  if (error) throw error;
}
