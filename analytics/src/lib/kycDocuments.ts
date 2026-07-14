import { supabase } from '@/lib/supabase';
import { mapDbDocTypeToAdmin } from '@/lib/kycDocumentMatrix';
import type { BusinessDocument, DocumentStatus } from '@/types/admin';

const VERIFICATION_BUCKET = 'verification-documents';

type KycDocRow = {
  id: string;
  organization_id: string;
  doc_type: string;
  doc_label: string | null;
  storage_path: string | null;
  file_name: string | null;
  mime_type: string | null;
  file_size_bytes: number | null;
  status: string;
  rejection_notes: string | null;
  created_at: string;
  updated_at: string;
};

function mapDocStatus(row: KycDocRow): DocumentStatus {
  if (!row.storage_path?.trim()) return 'Missing';
  switch (row.status) {
    case 'verified':
      return 'Valid';
    case 'rejected':
      return 'Flagged';
    case 'expired':
      return 'Expired';
    default:
      return 'Valid';
  }
}

function normalizeMime(mime: string | null): BusinessDocument['mime_type'] {
  if (mime === 'application/pdf') return 'application/pdf';
  if (mime === 'image/png') return 'image/png';
  return 'image/jpeg';
}

export async function fetchKycDocumentsByOrg(): Promise<Record<string, BusinessDocument[]>> {
  const { data, error } = await supabase
    .from('organization_kyc_documents')
    .select(
      'id,organization_id,doc_type,doc_label,storage_path,file_name,mime_type,file_size_bytes,status,rejection_notes,created_at,updated_at',
    )
    .is('deleted_at', null)
    .order('created_at', { ascending: true });

  if (error || !data?.length) return {};

  const rows = data as KycDocRow[];
  const paths = [...new Set(rows.map((r) => r.storage_path).filter(Boolean))] as string[];
  const signedByPath: Record<string, string> = {};

  await Promise.all(
    paths.map(async (path) => {
      const { data: signed } = await supabase.storage
        .from(VERIFICATION_BUCKET)
        .createSignedUrl(path, 3600);
      if (signed?.signedUrl) signedByPath[path] = signed.signedUrl;
    }),
  );

  const byOrg: Record<string, BusinessDocument[]> = {};
  for (const row of rows) {
    const orgId = row.organization_id;
    if (!byOrg[orgId]) byOrg[orgId] = [];
    const path = row.storage_path?.trim() ?? '';
    byOrg[orgId].push({
      id: row.id,
      type: mapDbDocTypeToAdmin(row.doc_type),
      file_name: row.file_name ?? row.doc_label ?? row.doc_type,
      status: mapDocStatus(row),
      flag_reason: row.rejection_notes ?? undefined,
      uploaded_at: row.updated_at ?? row.created_at,
      url: path ? (signedByPath[path] ?? '') : '',
      mime_type: normalizeMime(row.mime_type),
      size_kb: row.file_size_bytes ? Math.round(row.file_size_bytes / 1024) : 0,
    });
  }

  return byOrg;
}
