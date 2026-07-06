import { supabase } from '@/lib/supabase';

import type {
  OrganizationKycDocument,
  OrganizationKycDocType,
} from '@/features/organization/types/organizationKycDocuments.types';

export type UpsertOrganizationKycDocumentInput = {
  doc_type: OrganizationKycDocType;
  doc_label?: string;
  storage_path: string;
  file_name: string;
  mime_type: string;
  file_size_bytes?: number;
  is_mandatory?: boolean;
};

const DOC_SELECT =
  'id,organization_id,doc_type,doc_label,storage_path,file_name,mime_type,file_size_bytes,is_mandatory,status,verified_at,rejection_notes,created_at,updated_at';

export async function listOrganizationKycDocuments(
  orgId: string,
): Promise<{ error: Error | null; documents: OrganizationKycDocument[] }> {
  const { data, error } = await supabase()
    .from('organization_kyc_documents')
    .select(DOC_SELECT)
    .eq('organization_id', orgId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true });

  if (error) return { error: new Error(error.message), documents: [] };
  return { error: null, documents: (data ?? []) as OrganizationKycDocument[] };
}

export async function upsertOrganizationKycDocument(
  orgId: string,
  payload: UpsertOrganizationKycDocumentInput,
): Promise<{ error: Error | null; document: OrganizationKycDocument | null }> {
  const { data: { user } } = await supabase().auth.getUser();

  const { data: existing, error: findErr } = await supabase()
    .from('organization_kyc_documents')
    .select('id')
    .eq('organization_id', orgId)
    .eq('doc_type', payload.doc_type)
    .is('deleted_at', null)
    .maybeSingle();

  if (findErr) return { error: new Error(findErr.message), document: null };

  const row = {
    organization_id: orgId,
    doc_type: payload.doc_type,
    doc_label: payload.doc_label ?? null,
    storage_path: payload.storage_path,
    file_name: payload.file_name,
    mime_type: payload.mime_type,
    file_size_bytes: payload.file_size_bytes ?? null,
    is_mandatory: payload.is_mandatory ?? true,
    status: 'pending' as const,
    verified_at: null,
    rejection_notes: null,
    uploaded_by: user?.id ?? null,
    updated_at: new Date().toISOString(),
  };

  if (existing?.id) {
    const { data, error } = await supabase()
      .from('organization_kyc_documents')
      .update(row)
      .eq('id', existing.id)
      .select(DOC_SELECT)
      .single();
    if (error) return { error: new Error(error.message), document: null };
    return { error: null, document: data as OrganizationKycDocument };
  }

  const { data, error } = await supabase()
    .from('organization_kyc_documents')
    .insert(row)
    .select(DOC_SELECT)
    .single();

  if (error) return { error: new Error(error.message), document: null };
  return { error: null, document: data as OrganizationKycDocument };
}

export async function removeOrganizationKycDocument(
  orgId: string,
  docType: OrganizationKycDocType,
): Promise<{ error: Error | null }> {
  const { error } = await supabase()
    .from('organization_kyc_documents')
    .update({ deleted_at: new Date().toISOString(), storage_path: null })
    .eq('organization_id', orgId)
    .eq('doc_type', docType)
    .is('deleted_at', null);

  if (error) return { error: new Error(error.message) };
  return { error: null };
}

export function latestOrgKycDocument(
  documents: OrganizationKycDocument[],
  docType: OrganizationKycDocType,
): OrganizationKycDocument | undefined {
  return documents
    .filter((d) => d.doc_type === docType && d.storage_path)
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0];
}
