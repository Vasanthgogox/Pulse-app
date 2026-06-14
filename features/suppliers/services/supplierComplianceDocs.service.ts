import { supabase } from "@/lib/supabase";
import type { ComplianceDocument } from "@/features/suppliers/types/supplierManagement.types";

export type SupplierComplianceDocType =
  | "insurance"
  | "pollution_certificate"
  | "gst"
  | "labor_license"
  | "vehicle_fitness"
  | "trade_license"
  | "other";

export type CreateSupplierComplianceDocData = {
  doc_type: SupplierComplianceDocType;
  label: string;
  expiry_date?: string;
  storage_path?: string;
  file_name?: string;
  notes?: string;
};

export type UpdateSupplierComplianceDocData = Partial<
  Omit<CreateSupplierComplianceDocData, "doc_type">
> & {
  status?: "green" | "amber" | "red";
};

function computeStatus(expiryDate?: string): "green" | "amber" | "red" {
  if (!expiryDate) return "amber";
  const days = Math.floor(
    (new Date(expiryDate).getTime() - Date.now()) / 86400000,
  );
  if (days > 30) return "green";
  if (days >= 0) return "amber";
  return "red";
}

export async function getSupplierComplianceDocs(
  orgId: string,
  supplierId: string,
): Promise<{ error: Error | null; docs: ComplianceDocument[] }> {
  const { data, error } = await supabase()
    .from("supplier_compliance_documents")
    .select("*")
    .eq("organization_id", orgId)
    .eq("supplier_id", supplierId)
    .is("deleted_at", null)
    .order("expiry_date", { ascending: true, nullsFirst: false });
  if (error) return { error: new Error(error.message), docs: [] };
  return { error: null, docs: (data ?? []) as ComplianceDocument[] };
}

export async function createSupplierComplianceDoc(
  orgId: string,
  supplierId: string,
  payload: CreateSupplierComplianceDocData,
): Promise<{ error: Error | null; doc: ComplianceDocument | null }> {
  const { data, error } = await supabase()
    .from("supplier_compliance_documents")
    .insert({
      organization_id: orgId,
      supplier_id: supplierId,
      ...payload,
      status: computeStatus(payload.expiry_date),
    })
    .select()
    .single();
  if (error) return { error: new Error(error.message), doc: null };
  return { error: null, doc: data as ComplianceDocument };
}

export async function updateSupplierComplianceDoc(
  docId: string,
  patch: UpdateSupplierComplianceDocData,
): Promise<{ error: Error | null }> {
  const updates = {
    ...patch,
    ...(patch.expiry_date && !patch.status
      ? { status: computeStatus(patch.expiry_date) }
      : {}),
  };
  const { error } = await supabase()
    .from("supplier_compliance_documents")
    .update(updates)
    .eq("id", docId);
  if (error) return { error: new Error(error.message) };
  return { error: null };
}

export async function deleteSupplierComplianceDoc(
  docId: string,
): Promise<{ error: Error | null }> {
  const { error } = await supabase()
    .from("supplier_compliance_documents")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", docId);
  if (error) return { error: new Error(error.message) };
  return { error: null };
}
