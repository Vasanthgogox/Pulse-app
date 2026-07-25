import { supabase } from '@/lib/supabase';
import { mapDbDocTypeToAdmin } from '@/lib/kycDocumentMatrix';
import type { BusinessDocument, DocumentStatus } from '@/types/admin';

const VERIFICATION_BUCKET = 'verification-documents';
const SIGNED_URL_TTL_SEC = 60 * 60; // 1 hour

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

/** Preserve the uploaded MIME so preview/download stay in the original format. */
export function resolveDocumentMime(
  mime: string | null | undefined,
  fileName: string | null | undefined,
): string {
  const cleaned = (mime ?? '').trim().toLowerCase();
  if (cleaned && cleaned !== 'application/octet-stream') return cleaned;

  const name = (fileName ?? '').toLowerCase();
  if (name.endsWith('.pdf')) return 'application/pdf';
  if (name.endsWith('.png')) return 'image/png';
  if (name.endsWith('.webp')) return 'image/webp';
  if (name.endsWith('.heic') || name.endsWith('.heif')) return 'image/heic';
  if (name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'image/jpeg';
  return cleaned || 'application/octet-stream';
}

export function isImageMime(mime: string): boolean {
  return mime.startsWith('image/') && !mime.includes('heic') && !mime.includes('heif');
}

export function isPdfMime(mime: string): boolean {
  return mime === 'application/pdf' || mime.includes('pdf');
}

/** Browser-native preview (iframe/img). HEIC/HEIF need download/open. */
export function canInlinePreview(mime: string): boolean {
  return isPdfMime(mime) || isImageMime(mime);
}

export async function createDocumentSignedUrl(
  storagePath: string,
): Promise<{ url: string | null; error: string | null }> {
  const path = storagePath.trim();
  if (!path) return { url: null, error: 'Missing storage path' };

  const { data, error } = await supabase.storage
    .from(VERIFICATION_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SEC);

  if (error) return { url: null, error: error.message };
  return { url: data?.signedUrl ?? null, error: data?.signedUrl ? null : 'Signed URL empty' };
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
  const paths = [...new Set(rows.map((r) => r.storage_path?.trim()).filter(Boolean))] as string[];
  const signedByPath: Record<string, string> = {};

  await Promise.all(
    paths.map(async (path) => {
      const { url } = await createDocumentSignedUrl(path);
      if (url) signedByPath[path] = url;
    }),
  );

  const byOrg: Record<string, BusinessDocument[]> = {};
  for (const row of rows) {
    const orgId = row.organization_id;
    if (!byOrg[orgId]) byOrg[orgId] = [];
    const path = row.storage_path?.trim() ?? '';
    const fileName = row.file_name ?? row.doc_label ?? row.doc_type;
    byOrg[orgId].push({
      id: row.id,
      type: mapDbDocTypeToAdmin(row.doc_type),
      file_name: fileName,
      status: mapDocStatus(row),
      flag_reason: row.rejection_notes ?? undefined,
      uploaded_at: row.updated_at ?? row.created_at,
      storage_path: path,
      url: path ? (signedByPath[path] ?? '') : '',
      mime_type: resolveDocumentMime(row.mime_type, fileName),
      size_kb: row.file_size_bytes ? Math.round(row.file_size_bytes / 1024) : 0,
    });
  }

  return byOrg;
}
