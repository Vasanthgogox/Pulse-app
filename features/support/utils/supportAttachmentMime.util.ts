export function resolveSupportAttachmentMime(
  mimeType: string | undefined | null,
  fileName: string,
): string {
  const raw = (mimeType ?? '').trim().toLowerCase();
  if (raw === 'image/jpg') return 'image/jpeg';
  if (raw && raw !== 'application/octet-stream') return raw;
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  const byExt: Record<string, string> = {
    pdf: 'application/pdf',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    heic: 'image/heic',
    heif: 'image/heif',
  };
  return byExt[ext] ?? (raw || 'application/octet-stream');
}

export function filesFromClipboardData(data: DataTransfer | null | undefined): File[] {
  if (!data) return [];
  const fromList = data.files?.length ? Array.from(data.files) : [];
  if (fromList.length) return fromList;
  const fromItems: File[] = [];
  for (const item of Array.from(data.items ?? [])) {
    if (item.kind !== 'file') continue;
    const file = item.getAsFile();
    if (file) fromItems.push(file);
  }
  return fromItems;
}
