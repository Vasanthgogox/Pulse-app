import { supabase } from "@/lib/supabase";
import type { SupplierVehicle } from "@/features/suppliers/types/supplierManagement.types";

export type CreateSupplierVehicleData = {
  vehicle_number: string;
  vehicle_type?: string;
  capacity_tons?: number;
  ownership?: "owned" | "leased" | "hired";
  insurance_expiry?: string;
  fitness_expiry?: string;
  permit_expiry?: string;
  has_gps?: boolean;
  driver_id?: string;
  notes?: string;
};

export type UpdateSupplierVehicleData = Partial<CreateSupplierVehicleData>;

export async function getSupplierFleet(
  orgId: string,
  supplierId: string,
): Promise<{ error: Error | null; fleet: SupplierVehicle[] }> {
  const { data, error } = await supabase()
    .from("supplier_fleet")
    .select("*")
    .eq("organization_id", orgId)
    .eq("supplier_id", supplierId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  if (error) return { error: new Error(error.message), fleet: [] };
  return { error: null, fleet: (data ?? []) as SupplierVehicle[] };
}

export async function createSupplierVehicle(
  orgId: string,
  supplierId: string,
  payload: CreateSupplierVehicleData,
): Promise<{ error: Error | null; vehicle: SupplierVehicle | null }> {
  const { data, error } = await supabase()
    .from("supplier_fleet")
    .insert({
      organization_id: orgId,
      supplier_id: supplierId,
      ...payload,
      ownership: payload.ownership ?? "owned",
    })
    .select()
    .single();
  if (error) return { error: new Error(error.message), vehicle: null };
  return { error: null, vehicle: data as SupplierVehicle };
}

export async function updateSupplierVehicle(
  vehicleId: string,
  patch: UpdateSupplierVehicleData,
): Promise<{ error: Error | null }> {
  const { error } = await supabase()
    .from("supplier_fleet")
    .update(patch)
    .eq("id", vehicleId);
  if (error) return { error: new Error(error.message) };
  return { error: null };
}

export async function deleteSupplierVehicle(
  vehicleId: string,
): Promise<{ error: Error | null }> {
  const { error } = await supabase()
    .from("supplier_fleet")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", vehicleId);
  if (error) return { error: new Error(error.message) };
  return { error: null };
}
