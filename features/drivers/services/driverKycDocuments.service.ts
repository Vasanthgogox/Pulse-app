/**
 * Driver KYC documents — same pattern as organizationKycDocuments.service.ts /
 * clientKycDocuments.service.ts, keyed by driver_user_id (auth.uid()) instead
 * of an org/client id, since identity documents are per-person.
 *
 * Upload/resubmit is client-driven (RLS INSERT policy for first upload;
 * driver_resubmit_kyc_document RPC for any subsequent file replacing an
 * existing row — direct UPDATE is intentionally not RLS-permitted, see the
 * migration). Approve/reject are platform-admin RPCs, not exposed here for
 * the driver-facing side — see driverKycAdmin.service.ts.
 */
import { supabase } from '@/lib/supabase';

export type DriverKycDocType = 'license' | 'aadhaar' | 'pan' | 'selfie' | 'other';
export type DriverKycStatus = 'pending' | 'verified' | 'rejected' | 'expired';

export interface DriverKycDocument {
  id: string;
  driver_user_id: string;
  doc_type: DriverKycDocType;
  doc_label: string | null;
  storage_path: string | null;
  file_name: string | null;
  mime_type: string | null;
  file_size_bytes: number | null;
  is_mandatory: boolean;
  status: DriverKycStatus;
  verified_at: string | null;
  rejection_notes: string | null;
  created_at: string;
  updated_at: string;
}

const DOC_SELECT =
  'id,driver_user_id,doc_type,doc_label,storage_path,file_name,mime_type,file_size_bytes,is_mandatory,status,verified_at,rejection_notes,created_at,updated_at';

export async function listMyDriverKycDocuments(): Promise<{
  error: Error | null;
  documents: DriverKycDocument[];
}> {
  const {
    data: { user },
  } = await supabase().auth.getUser();
  if (!user) return { error: null, documents: [] };

  const { data, error } = await supabase()
    .from('driver_kyc_documents')
    .select(DOC_SELECT)
    .eq('driver_user_id', user.id)
    .is('deleted_at', null)
    .order('created_at', { ascending: true });

  if (error) return { error: new Error(error.message), documents: [] };
  return { error: null, documents: (data ?? []) as DriverKycDocument[] };
}

export type SubmitDriverKycDocumentInput = {
  doc_type: DriverKycDocType;
  storage_path: string;
  file_name: string;
  mime_type: string;
  file_size_bytes?: number;
};

/**
 * Upload or resubmit a document. First submission for a doc_type is a plain
 * INSERT (RLS-permitted). Any file replacing an existing row — including
 * "fix a pending upload" and "resubmit after rejection" — goes through the
 * driver_resubmit_kyc_document RPC, which is the only way a driver's own
 * write can reset status back to 'pending' (a direct UPDATE cannot, since
 * there is no direct UPDATE policy on this table).
 */
export async function submitDriverKycDocument(
  payload: SubmitDriverKycDocumentInput,
): Promise<{ error: Error | null; document: DriverKycDocument | null }> {
  const {
    data: { user },
  } = await supabase().auth.getUser();
  if (!user) return { error: new Error('Not signed in'), document: null };

  const { data: existing, error: findErr } = await supabase()
    .from('driver_kyc_documents')
    .select('id,storage_path')
    .eq('driver_user_id', user.id)
    .eq('doc_type', payload.doc_type)
    .is('deleted_at', null)
    .maybeSingle();

  if (findErr) return { error: new Error(findErr.message), document: null };

  if (existing?.id) {
    const { data, error } = await supabase().rpc('driver_resubmit_kyc_document', {
      p_document_id: existing.id,
      p_storage_path: payload.storage_path,
      p_file_name: payload.file_name,
      p_mime_type: payload.mime_type,
      p_file_size: payload.file_size_bytes ?? null,
    });
    if (error) return { error: new Error(error.message), document: null };

    // Storage lifecycle: the old file is now unreferenced by any row — clean
    // it up client-side under the existing "drivers can delete own documents"
    // storage policy, same convention as tripDocuments.service.ts's
    // deleteTripDocument (storage.remove() alongside the row change, not a
    // DB trigger — this codebase has no storage-cleanup triggers anywhere).
    // Best-effort: the resubmit itself already succeeded, so a storage
    // cleanup failure here shouldn't surface as an upload failure to the
    // driver — it becomes an orphan for a future sweep, not a broken upload.
    const oldPath = (existing as { storage_path: string | null }).storage_path;
    if (oldPath && oldPath !== payload.storage_path) {
      await supabase().storage.from('driver-documents').remove([oldPath]);
    }

    return { error: null, document: data as DriverKycDocument };
  }

  const { data, error } = await supabase()
    .from('driver_kyc_documents')
    .insert({
      driver_user_id: user.id,
      doc_type: payload.doc_type,
      storage_path: payload.storage_path,
      file_name: payload.file_name,
      mime_type: payload.mime_type,
      file_size_bytes: payload.file_size_bytes ?? null,
      uploaded_by: user.id,
    })
    .select(DOC_SELECT)
    .single();

  if (error) return { error: new Error(error.message), document: null };
  return { error: null, document: data as DriverKycDocument };
}

export function latestDriverKycDocument(
  documents: DriverKycDocument[],
  docType: DriverKycDocType,
): DriverKycDocument | undefined {
  return documents
    .filter((d) => d.doc_type === docType)
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0];
}
