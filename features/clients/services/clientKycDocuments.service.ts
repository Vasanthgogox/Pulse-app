import type {
  ClientKycDocType,
  ClientKycDocumentRow,
} from '@/features/clients/types/clientManagement.types';
import { supabase } from '@/lib/supabase';

export type CreateClientKycDocData = {
  doc_type: ClientKycDocType;
  doc_label?: string | null;
  storage_path?: string | null;
  file_name?: string | null;
  mime_type?: string | null;
  expiry_date?: string | null;
  is_mandatory?: boolean;
  notes?: string | null;
};

export async function getClientKycDocuments(
  orgId: string,
  clientId: string,
): Promise<{ error: Error | null; documents: ClientKycDocumentRow[] }> {
  const { data, error } = await supabase()
    .from('client_kyc_documents')
    .select('*')
    .eq('organization_id', orgId)
    .eq('client_id', clientId)
    .is('deleted_at', null)
    .order('doc_type')
    .order('version_number', { ascending: false });
  if (error) return { error: new Error(error.message), documents: [] };
  return { error: null, documents: (data ?? []) as ClientKycDocumentRow[] };
}

export async function upsertClientKycDocument(
  orgId: string,
  clientId: string,
  payload: CreateClientKycDocData,
): Promise<{ error: Error | null; document: ClientKycDocumentRow | null }> {
  const { data, error } = await supabase()
    .from('client_kyc_documents')
    .insert({
      organization_id: orgId,
      client_id: clientId,
      status: 'pending',
      version_number: 1,
      is_mandatory: payload.is_mandatory ?? false,
      ...payload,
    })
    .select()
    .single();
  if (error) return { error: new Error(error.message), document: null };
  return { error: null, document: data as ClientKycDocumentRow };
}

export async function updateClientKycDocumentStatus(
  docId: string,
  status: ClientKycDocumentRow['status'],
): Promise<{ error: Error | null }> {
  const patch: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
  };
  if (status === 'verified') {
    patch.verified_at = new Date().toISOString();
  }
  const { error } = await supabase()
    .from('client_kyc_documents')
    .update(patch)
    .eq('id', docId);
  if (error) return { error: new Error(error.message) };
  return { error: null };
}
