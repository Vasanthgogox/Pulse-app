import { supabase } from '@/lib/supabase';

export interface ClientWarehouse {
  id: string;
  organization_id: string;
  client_id: string;
  warehouse_code: string | null;
  warehouse_zone: string | null;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  local_gstin: string | null;
  dock_count: number | null;
  capacity_tons: number | null;
  manager_name: string | null;
  manager_phone: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  created_at: string;
  updated_at: string;
}

export type CreateWarehouseData = Omit<ClientWarehouse, 'id' | 'created_at' | 'updated_at'>;
export type UpdateWarehouseData = Partial<Omit<ClientWarehouse, 'id' | 'organization_id' | 'client_id' | 'created_at' | 'updated_at'>>;

export async function getWarehousesByClient(
  orgId: string,
  clientId: string,
): Promise<{ error: Error | null; warehouses: ClientWarehouse[] }> {
  const { data, error } = await supabase()
    .from('client_warehouses')
    .select('*')
    .eq('organization_id', orgId)
    .eq('client_id', clientId)
    .order('created_at', { ascending: true });
  if (error) return { error: new Error(error.message), warehouses: [] };
  return { error: null, warehouses: (data ?? []) as ClientWarehouse[] };
}

export async function createWarehouse(
  orgId: string,
  clientId: string,
  data: UpdateWarehouseData,
): Promise<{ error: Error | null; warehouse: ClientWarehouse | null }> {
  const { data: row, error } = await supabase()
    .from('client_warehouses')
    .insert({ organization_id: orgId, client_id: clientId, ...data })
    .select()
    .single();
  if (error) return { error: new Error(error.message), warehouse: null };
  return { error: null, warehouse: row as ClientWarehouse };
}

export async function updateWarehouse(
  warehouseId: string,
  data: UpdateWarehouseData,
): Promise<{ error: Error | null; updated: boolean }> {
  const { error } = await supabase()
    .from('client_warehouses')
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq('id', warehouseId);
  if (error) return { error: new Error(error.message), updated: false };
  return { error: null, updated: true };
}

export async function deleteWarehouse(
  warehouseId: string,
): Promise<{ error: Error | null }> {
  const { error } = await supabase()
    .from('client_warehouses')
    .delete()
    .eq('id', warehouseId);
  if (error) return { error: new Error(error.message) };
  return { error: null };
}
