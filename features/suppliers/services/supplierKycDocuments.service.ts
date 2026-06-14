import { supabase } from "@/lib/supabase";
import type { SupplierKycDocument, SupplierKycDocType } from "@/features/suppliers/types/supplierManagement.types";

export type UpsertSupplierKycDocData = {
  doc_type: SupplierKycDocType;
  doc_label?: string;
  storage_path?: string;
  file_name?: string;
  mime_type?: string;
  expiry_date?: string;
  is_mandatory?: boolean;
  notes?: string;
};

export async function getSupplierKycDocuments(
  orgId: string,
  supplierId: string,
): Promise<{ error: Error | null; documents: SupplierKycDocument[] }> {
  const { data, error } = await supabase()
    .from("supplier_kyc_documents")
    .select("*")
    .eq("organization_id", orgId)
    .eq("supplier_id", supplierId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  if (error) return { error: new Error(error.message), documents: [] };
  return { error: null, documents: (data ?? []) as SupplierKycDocument[] };
}

export async function upsertSupplierKycDocument(
  orgId: string,
  supplierId: string,
  payload: UpsertSupplierKycDocData,
): Promise<{ error: Error | null; document: SupplierKycDocument | null }> {
  const { data, error } = await supabase()
    .from("supplier_kyc_documents")
    .insert({
      organization_id: orgId,
      supplier_id: supplierId,
      ...payload,
      status: "pending",
      version_number: 1,
    })
    .select()
    .single();
  if (error) return { error: new Error(error.message), document: null };
  return { error: null, document: data as SupplierKycDocument };
}

export async function updateSupplierKycDocumentStatus(
  docId: string,
  status: "pending" | "verified" | "rejected" | "expired",
): Promise<{ error: Error | null }> {
  const updates: Record<string, unknown> = { status };
  if (status === "verified") updates.verified_at = new Date().toISOString();
  const { error } = await supabase()
    .from("supplier_kyc_documents")
    .update(updates)
    .eq("id", docId);
  if (error) return { error: new Error(error.message) };
  return { error: null };
}
