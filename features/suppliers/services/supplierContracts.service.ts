import { supabase } from "@/lib/supabase";
import type { SupplierContract } from "@/features/suppliers/types/supplierManagement.types";

export type CreateSupplierContractData = {
  contract_number: string;
  title?: string;
  status?: "draft" | "active" | "expired" | "terminated" | "renewal_pending";
  rate_type?: "per_trip" | "per_ton" | "per_km" | "per_vehicle_type" | "fixed_monthly";
  effective_date?: string;
  expiry_date?: string;
  payment_terms?: {
    credit_days?: number;
    invoice_frequency?: string;
    billing_cycle?: string;
  };
  sla_terms?: Record<string, unknown>;
  general_terms?: string;
  notes?: string;
};

export type UpdateSupplierContractData = Partial<CreateSupplierContractData>;

export async function getSupplierContracts(
  orgId: string,
  supplierId: string,
): Promise<{ error: Error | null; contracts: SupplierContract[] }> {
  const { data, error } = await supabase()
    .from("supplier_contract_agreements")
    .select("*")
    .eq("organization_id", orgId)
    .eq("supplier_id", supplierId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (error) return { error: new Error(error.message), contracts: [] };
  return { error: null, contracts: (data ?? []) as SupplierContract[] };
}

export async function createSupplierContract(
  orgId: string,
  supplierId: string,
  payload: CreateSupplierContractData,
): Promise<{ error: Error | null; contract: SupplierContract | null }> {
  const { data, error } = await supabase()
    .from("supplier_contract_agreements")
    .insert({
      organization_id: orgId,
      supplier_id: supplierId,
      ...payload,
      status: payload.status ?? "draft",
    })
    .select()
    .single();
  if (error) return { error: new Error(error.message), contract: null };
  return { error: null, contract: data as SupplierContract };
}

export async function updateSupplierContract(
  contractId: string,
  patch: UpdateSupplierContractData,
): Promise<{ error: Error | null }> {
  const { error } = await supabase()
    .from("supplier_contract_agreements")
    .update(patch)
    .eq("id", contractId);
  if (error) return { error: new Error(error.message) };
  return { error: null };
}

export async function deleteSupplierContract(
  contractId: string,
): Promise<{ error: Error | null }> {
  const { error } = await supabase()
    .from("supplier_contract_agreements")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", contractId);
  if (error) return { error: new Error(error.message) };
  return { error: null };
}
