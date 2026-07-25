import { supabase } from '@/lib/supabase';
import { mapDbDocTypeToAdmin } from '@/lib/kycDocumentMatrix';
import type { BusinessDocument, DocumentStatus } from '@/types/admin';

const VERIFICATION_BUCKET = 'verification-documents';
/** Signed URL lifetime — preview can re-sign via storage_path when this expires. */
const SIGNED_URL_TTL_SEC = 3600;

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

function extensionOf(pathOrName: string | null | undefined): string {
  if (!pathOrName) return '';
  const base = pathOrName.split('?')[0].split('#')[0];
  const leaf = base.split('/').pop() ?? base;
  const dot = leaf.lastIndexOf('.');
  return dot >= 0 ? leaf.slice(dot + 1).toLowerCase() : '';
}

/** Resolve a previewable MIME from DB mime + file name + storage path. */
export function resolveKycMime(
  mime: string | null | undefined,
  fileName: string | null | undefined,
  storagePath?: string | null,
): BusinessDocument['mime_type'] {
  const m = (mime ?? '').toLowerCase().trim();
  if (m === 'application/pdf') return 'application/pdf';
  if (m === 'image/png') return 'image/png';
  if (m === 'image/webp') return 'image/webp';
  if (m === 'image/gif') return 'image/gif';
  if (m === 'image/jpeg' || m === 'image/jpg') return 'image/jpeg';

  const ext = extensionOf(fileName) || extensionOf(storagePath);
  if (ext === 'pdf') return 'application/pdf';
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'gif') return 'image/gif';
  if (ext === 'jpg' || ext === 'jpeg' || ext === 'jfif') return 'image/jpeg';

  // KYC uploads are usually PDF when mime is missing/octet-stream.
  return 'application/pdf';
}

export type KycPreviewKind = 'image' | 'pdf' | 'other';

export function kycPreviewKind(doc: Pick<BusinessDocument, 'mime_type' | 'file_name' | 'storage_path'>): KycPreviewKind {
  const mime = resolveKycMime(doc.mime_type, doc.file_name, doc.storage_path);
  if (mime === 'application/pdf') return 'pdf';
  if (mime.startsWith('image/')) return 'image';
  return 'other';
}

/** Fresh signed URL for an uploaded KYC object — call again when a preview expires. */
export async function signKycDocumentUrl(
  storagePath: string,
  ttlSec: number = SIGNED_URL_TTL_SEC,
): Promise<{ url: string | null; error: string | null }> {
  const path = storagePath.trim();
  if (!path) return { url: null, error: 'Missing storage path' };

  const { data, error } = await supabase.storage
    .from(VERIFICATION_BUCKET)
    .createSignedUrl(path, ttlSec);

  if (error) return { url: null, error: error.message };
  return { url: data?.signedUrl ?? null, error: data?.signedUrl ? null : 'No signed URL returned' };
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
      const { url } = await signKycDocumentUrl(path);
      if (url) signedByPath[path] = url;
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
      storage_path: path || undefined,
      url: path ? (signedByPath[path] ?? '') : '',
      mime_type: resolveKycMime(row.mime_type, row.file_name, path),
      size_kb: row.file_size_bytes ? Math.round(row.file_size_bytes / 1024) : 0,
    });
  }

  return byOrg;
}
