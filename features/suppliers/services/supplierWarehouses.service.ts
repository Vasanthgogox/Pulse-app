import { supabase } from "@/lib/supabase";
import type { SupplierWarehouse } from "@/features/suppliers/types/supplierManagement.types";

export type CreateSupplierWarehouseData = {
  name: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  contact_name?: string;
  contact_phone?: string;
  storage_capacity_tons?: number;
  loading_bays?: number;
  notes?: string;
};

export type UpdateSupplierWarehouseData = Partial<CreateSupplierWarehouseData>;

export async function getSupplierWarehouses(
  orgId: string,
  supplierId: string,
): Promise<{ error: Error | null; warehouses: SupplierWarehouse[] }> {
  const { data, error } = await supabase()
    .from("supplier_warehouses")
    .select("*")
    .eq("organization_id", orgId)
    .eq("supplier_id", supplierId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  if (error) return { error: new Error(error.message), warehouses: [] };
  return { error: null, warehouses: (data ?? []) as SupplierWarehouse[] };
}

export async function createSupplierWarehouse(
  orgId: string,
  supplierId: string,
  payload: CreateSupplierWarehouseData,
): Promise<{ error: Error | null; warehouse: SupplierWarehouse | null }> {
  const { data, error } = await supabase()
    .from("supplier_warehouses")
    .insert({ organization_id: orgId, supplier_id: supplierId, ...payload })
    .select()
    .single();
  if (error) return { error: new Error(error.message), warehouse: null };
  return { error: null, warehouse: data as SupplierWarehouse };
}

export async function updateSupplierWarehouse(
  warehouseId: string,
  patch: UpdateSupplierWarehouseData,
): Promise<{ error: Error | null }> {
  const { error } = await supabase()
    .from("supplier_warehouses")
    .update(patch)
    .eq("id", warehouseId);
  if (error) return { error: new Error(error.message) };
  return { error: null };
}

export async function deleteSupplierWarehouse(
  warehouseId: string,
): Promise<{ error: Error | null }> {
  const { error } = await supabase()
    .from("supplier_warehouses")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", warehouseId);
  if (error) return { error: new Error(error.message) };
  return { error: null };
}
