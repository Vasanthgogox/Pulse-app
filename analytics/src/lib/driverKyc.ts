import { supabase } from '@/lib/supabase';
import { resolveDocumentMime } from '@/lib/kycDocuments';

const DRIVER_DOCUMENTS_BUCKET = 'driver-documents';
const SIGNED_URL_TTL_SEC = 60 * 60; // 1 hour

export type DriverKycDocType = 'license' | 'aadhaar' | 'pan' | 'selfie' | 'other';
export type DriverKycStatus = 'pending' | 'verified' | 'rejected' | 'expired';

export interface DriverKycQueueRow {
  id: string;
  driver_user_id: string;
  driver_name: string | null;
  driver_phone: string | null;
  doc_type: DriverKycDocType;
  storage_path: string | null;
  file_name: string | null;
  mime_type: string;
  file_size_bytes: number | null;
  status: DriverKycStatus;
  rejection_notes: string | null;
  created_at: string;
  updated_at: string;
  signed_url: string;
}

/** Driver documents live in a separate storage bucket from org/client/supplier KYC. */
export async function createDriverDocumentSignedUrl(
  storagePath: string,
): Promise<{ url: string | null; error: string | null }> {
  const path = storagePath.trim();
  if (!path) return { url: null, error: 'Missing storage path' };

  const { data, error } = await supabase.storage
    .from(DRIVER_DOCUMENTS_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SEC);

  if (error) return { url: null, error: error.message };
  return { url: data?.signedUrl ?? null, error: data?.signedUrl ? null : 'Signed URL empty' };
}

/**
 * Pending-first review queue. RLS on driver_kyc_documents already restricts
 * this SELECT to callers with the `driver_kyc.review` platform permission
 * (or the driver's own rows) — no separate admin check needed here, same
 * posture as fetchKycDocumentsByOrg for organization KYC.
 */
export async function fetchDriverKycQueue(): Promise<DriverKycQueueRow[]> {
  const { data, error } = await supabase
    .from('driver_kyc_documents')
    .select(
      'id,driver_user_id,doc_type,storage_path,file_name,mime_type,file_size_bytes,status,rejection_notes,created_at,updated_at',
    )
    .is('deleted_at', null)
    .order('status', { ascending: true }) // 'pending' sorts before 'rejected'/'verified' alphabetically — acceptable default, refine with a CASE order if a stricter FIFO queue is needed
    .order('created_at', { ascending: true });

  if (error || !data?.length) return [];

  type Row = {
    id: string;
    driver_user_id: string;
    doc_type: DriverKycDocType;
    storage_path: string | null;
    file_name: string | null;
    mime_type: string | null;
    file_size_bytes: number | null;
    status: DriverKycStatus;
    rejection_notes: string | null;
    created_at: string;
    updated_at: string;
  };
  const rows = data as Row[];

  const driverIds = [...new Set(rows.map((r) => r.driver_user_id))];
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id,full_name,phone')
    .in('id', driverIds);
  const profileById = new Map(
    ((profiles ?? []) as { id: string; full_name: string | null; phone: string | null }[]).map(
      (p) => [p.id, p],
    ),
  );

  const paths = [...new Set(rows.map((r) => r.storage_path?.trim()).filter(Boolean))] as string[];
  const signedByPath: Record<string, string> = {};
  await Promise.all(
    paths.map(async (path) => {
      const { url } = await createDriverDocumentSignedUrl(path);
      if (url) signedByPath[path] = url;
    }),
  );

  return rows.map((row) => {
    const profile = profileById.get(row.driver_user_id);
    const path = row.storage_path?.trim() ?? '';
    return {
      id: row.id,
      driver_user_id: row.driver_user_id,
      driver_name: profile?.full_name ?? null,
      driver_phone: profile?.phone ?? null,
      doc_type: row.doc_type,
      storage_path: row.storage_path,
      file_name: row.file_name,
      mime_type: resolveDocumentMime(row.mime_type, row.file_name),
      file_size_bytes: row.file_size_bytes,
      status: row.status,
      rejection_notes: row.rejection_notes,
      created_at: row.created_at,
      updated_at: row.updated_at,
      signed_url: path ? (signedByPath[path] ?? '') : '',
    };
  });
}

export async function approveDriverKycDocument(
  documentId: string,
  notes?: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('platform_approve_driver_kyc_document', {
    p_document_id: documentId,
    p_notes: notes ?? null,
  });
  return { error: error?.message ?? null };
}

export async function rejectDriverKycDocument(
  documentId: string,
  rejectionReason: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('platform_reject_driver_kyc_document', {
    p_document_id: documentId,
    p_rejection_reason: rejectionReason,
  });
  return { error: error?.message ?? null };
}
