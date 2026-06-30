import { getIdentityDb as getSupabase } from '@/lib/supabase';
import type { Customer, Warehouse, Address } from '@/types/commerce';

// ─── DB row shapes ────────────────────────────────────────────────────────────
interface ClientRow {
  id: string;
  organization_id: string;
  name: string;
  contact_person: string | null;
  phone: string;
  email: string | null;
  address: string | null;
  gstin: string | null;
  status: string;
  // extended columns (20260911 migration)
  legal_name: string | null;
  trade_name: string | null;
  client_code: string | null;
  industry: string | null;
  country: string | null;
  state: string | null;
  registered_address: string | null;
  client_status: string | null;
  created_at: string;
  updated_at: string;
}

interface WarehouseRow {
  id: string;
  organization_id: string;
  client_id: string;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  warehouse_code: string | null;
  pincode: string | null;
  latitude: number | null;
  longitude: number | null;
  capacity_tons: number | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

function rowToAddress(row: WarehouseRow): Address {
  return {
    line1:   row.address ?? '',
    city:    row.city    ?? '',
    state:   row.state   ?? '',
    pincode: row.pincode ?? '',
    lat:     row.latitude  ?? undefined,
    lng:     row.longitude ?? undefined,
  };
}

function clientRowToCustomer(row: ClientRow): Customer {
  const billingAddr: Address = {
    line1:   row.registered_address ?? row.address ?? '',
    city:    '',
    state:   row.state ?? '',
    pincode: '',
  };
  return {
    id:               row.id,
    name:             row.legal_name ?? row.trade_name ?? row.name,
    email:            row.email ?? '',
    phone:            row.phone,
    company:          row.trade_name ?? row.name,
    billing_address:  billingAddr,
    shipping_address: billingAddr,
    total_orders:     0,
    total_spend:      0,
    created_at:       row.created_at,
  };
}

function warehouseRowToWarehouse(row: WarehouseRow): Warehouse {
  return {
    id:          row.id,
    name:        row.name,
    code:        row.warehouse_code ?? row.id.slice(0, 6).toUpperCase(),
    address:     rowToAddress(row),
    capacity_m3: row.capacity_tons ? row.capacity_tons * 1.2 : 0,
  };
}

// ─── Customers (clients) ─────────────────────────────────────────────────────

export async function fetchCustomers(organizationId: string): Promise<Customer[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data, error } = await sb
    .from('clients')
    .select('id,organization_id,name,contact_person,phone,email,address,gstin,status,legal_name,trade_name,client_code,industry,country,state,registered_address,client_status,created_at,updated_at')
    .eq('organization_id', organizationId)
    .eq('status', 'active')
    .order('name');
  if (error) throw error;
  return (data as ClientRow[]).map(clientRowToCustomer);
}

export async function createCustomer(
  organizationId: string,
  input: { name: string; phone: string; email?: string; gstin?: string; address?: string; trade_name?: string; state?: string },
): Promise<Customer> {
  const sb = getSupabase();
  if (!sb) throw new Error('Supabase not configured');
  const { data, error } = await sb
    .from('clients')
    .insert({
      organization_id: organizationId,
      name:        input.name,
      phone:       input.phone,
      email:       input.email,
      gstin:       input.gstin,
      address:     input.address,
      trade_name:  input.trade_name,
      legal_name:  input.name,
      state:       input.state,
    })
    .select('id,organization_id,name,contact_person,phone,email,address,gstin,status,legal_name,trade_name,client_code,industry,country,state,registered_address,client_status,created_at,updated_at')
    .single();
  if (error) throw error;
  return clientRowToCustomer(data as ClientRow);
}

export async function updateCustomer(
  id: string,
  patch: Partial<{ name: string; email: string; phone: string; address: string; trade_name: string; state: string; gstin: string }>,
): Promise<void> {
  const sb = getSupabase();
  if (!sb) throw new Error('Supabase not configured');
  const update: Record<string, unknown> = { ...patch, updated_at: new Date().toISOString() };
  if (patch.name) update['legal_name'] = patch.name;
  const { error } = await sb.from('clients').update(update).eq('id', id);
  if (error) throw error;
}

// ─── Warehouses (client_warehouses) ─────────────────────────────────────────

export async function fetchWarehouses(organizationId: string): Promise<Warehouse[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data, error } = await sb
    .from('client_warehouses')
    .select('id,organization_id,client_id,name,address,city,state,contact_name,contact_phone,warehouse_code,pincode,latitude,longitude,capacity_tons,deleted_at,created_at,updated_at')
    .eq('organization_id', organizationId)
    .is('deleted_at', null)
    .order('name');
  if (error) throw error;
  return (data as WarehouseRow[]).map(warehouseRowToWarehouse);
}

export async function fetchWarehousesForClient(clientId: string): Promise<Warehouse[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data, error } = await sb
    .from('client_warehouses')
    .select('id,organization_id,client_id,name,address,city,state,contact_name,contact_phone,warehouse_code,pincode,latitude,longitude,capacity_tons,deleted_at,created_at,updated_at')
    .eq('client_id', clientId)
    .is('deleted_at', null)
    .order('name');
  if (error) throw error;
  return (data as WarehouseRow[]).map(warehouseRowToWarehouse);
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
    contact_name?: string;
    contact_phone?: string;
    warehouse_code?: string;
    capacity_tons?: number;
  },
): Promise<Warehouse> {
  const sb = getSupabase();
  if (!sb) throw new Error('Supabase not configured');
  const { data, error } = await sb
    .from('client_warehouses')
    .insert({ organization_id: organizationId, client_id: clientId, ...input })
    .select('id,organization_id,client_id,name,address,city,state,contact_name,contact_phone,warehouse_code,pincode,latitude,longitude,capacity_tons,deleted_at,created_at,updated_at')
    .single();
  if (error) throw error;
  return warehouseRowToWarehouse(data as WarehouseRow);
}

export async function updateWarehouse(
  id: string,
  patch: Partial<{ name: string; address: string; city: string; state: string; pincode: string; latitude: number; longitude: number; capacity_tons: number; contact_name: string; contact_phone: string }>,
): Promise<void> {
  const sb = getSupabase();
  if (!sb) throw new Error('Supabase not configured');
  const { error } = await sb
    .from('client_warehouses')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function deleteWarehouse(id: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) throw new Error('Supabase not configured');
  const { error } = await sb
    .from('client_warehouses')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}
