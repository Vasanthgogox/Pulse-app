import * as DocumentPicker from 'expo-document-picker';
// expo-file-system SDK 54 moved readAsStringAsync/EncodingType to the legacy entry.
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import { resolveSupportAttachmentMime } from '@/features/support/utils/supportAttachmentMime.util';

export type PickedSupportAttachment = {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  arrayBuffer: ArrayBuffer;
};

export { filesFromClipboardData, resolveSupportAttachmentMime } from '@/features/support/utils/supportAttachmentMime.util';

/**
 * Chrome's file picker treats `application/pdf,image/*` as "PDF only".
 * Explicit extensions keep images selectable on web; native still uses MIME.
 */
const SUPPORT_PICKER_TYPES =
  Platform.OS === 'web'
    ? ['.pdf', '.png', '.jpg', '.jpeg', '.webp', '.heic', '.heif']
    : ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

function fileNameForWebFile(file: File): string {
  if (file.name && file.name !== 'blob') return file.name;
  const mime = resolveSupportAttachmentMime(file.type, '');
  const ext =
    mime === 'image/jpeg' ? 'jpg' : mime === 'application/pdf' ? 'pdf' : mime.split('/')[1] || 'png';
  return `screenshot-${Date.now()}.${ext}`;
}

async function readUriAsArrayBuffer(uri: string): Promise<ArrayBuffer> {
  if (Platform.OS === 'web') {
    const res = await fetch(uri);
    return res.arrayBuffer();
  }
  const base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

export async function supportAttachmentsFromFiles(
  files: File[],
): Promise<PickedSupportAttachment[]> {
  const out: PickedSupportAttachment[] = [];
  for (const file of files) {
    const arrayBuffer = await file.arrayBuffer();
    if (!arrayBuffer.byteLength) continue;
    const fileName = fileNameForWebFile(file);
    out.push({
      fileName,
      mimeType: resolveSupportAttachmentMime(file.type, fileName),
      sizeBytes: file.size ?? arrayBuffer.byteLength,
      arrayBuffer,
    });
  }
  return out;
}

/** Pick one or more files/images to attach to a Support ticket. */
export async function pickSupportTicketAttachments(): Promise<PickedSupportAttachment[]> {
  const res = await DocumentPicker.getDocumentAsync({
    multiple: true,
    copyToCacheDirectory: true,
    type: SUPPORT_PICKER_TYPES,
  });
  if (res.canceled || !res.assets?.length) return [];

  const webFiles = res.assets
    .map((asset) => asset.file)
    .filter((file): file is File => typeof File !== 'undefined' && file instanceof File);
  if (webFiles.length) return supportAttachmentsFromFiles(webFiles);

  const out: PickedSupportAttachment[] = [];
  for (const asset of res.assets) {
    const arrayBuffer = await readUriAsArrayBuffer(asset.uri);
    if (!arrayBuffer.byteLength) continue;
    const fileName = asset.name || `attachment-${Date.now()}`;
    out.push({
      fileName,
      mimeType: resolveSupportAttachmentMime(asset.mimeType, fileName),
      sizeBytes: asset.size ?? arrayBuffer.byteLength,
      arrayBuffer,
    });
  }
  return out;
}
