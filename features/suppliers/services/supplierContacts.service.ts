import { supabase } from "@/lib/supabase";
import type { SupplierContactRow } from "@/features/suppliers/types/supplierManagement.types";

export type CreateSupplierContactData = {
  name: string;
  designation?: string;
  mobile?: string;
  email?: string;
  department?: string;
  is_primary?: boolean;
  is_operations?: boolean;
  is_finance?: boolean;
  is_dispatch?: boolean;
  notes?: string;
};

export type UpdateSupplierContactData = Partial<CreateSupplierContactData>;

export async function getSupplierContacts(
  orgId: string,
  supplierId: string,
): Promise<{ error: Error | null; contacts: SupplierContactRow[] }> {
  const { data, error } = await supabase()
    .from("supplier_contacts")
    .select("*")
    .eq("organization_id", orgId)
    .eq("supplier_id", supplierId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  if (error) return { error: new Error(error.message), contacts: [] };
  return { error: null, contacts: (data ?? []) as SupplierContactRow[] };
}

export async function createSupplierContact(
  orgId: string,
  supplierId: string,
  data: CreateSupplierContactData,
): Promise<{ error: Error | null; contact: SupplierContactRow | null }> {
  const { data: row, error } = await supabase()
    .from("supplier_contacts")
    .insert({ organization_id: orgId, supplier_id: supplierId, ...data })
    .select()
    .single();
  if (error) return { error: new Error(error.message), contact: null };
  return { error: null, contact: row as SupplierContactRow };
}

export async function updateSupplierContact(
  contactId: string,
  patch: UpdateSupplierContactData,
): Promise<{ error: Error | null }> {
  const { error } = await supabase()
    .from("supplier_contacts")
    .update(patch)
    .eq("id", contactId);
  if (error) return { error: new Error(error.message) };
  return { error: null };
}

export async function deleteSupplierContact(
  contactId: string,
): Promise<{ error: Error | null }> {
  const { error } = await supabase()
    .from("supplier_contacts")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", contactId);
  if (error) return { error: new Error(error.message) };
  return { error: null };
}
