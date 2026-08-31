import * as DocumentPicker from 'expo-document-picker';
// expo-file-system SDK 54 moved readAsStringAsync/EncodingType to the legacy entry.
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';

export type PickedSupportAttachment = {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  arrayBuffer: ArrayBuffer;
};

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

/** Pick one or more files/images to attach to a Support ticket. */
export async function pickSupportTicketAttachments(): Promise<PickedSupportAttachment[]> {
  const res = await DocumentPicker.getDocumentAsync({
    multiple: true,
    copyToCacheDirectory: true,
    type: ['application/pdf', 'image/*'],
  });
  if (res.canceled || !res.assets?.length) return [];

  const out: PickedSupportAttachment[] = [];
  for (const asset of res.assets) {
    const arrayBuffer = await readUriAsArrayBuffer(asset.uri);
    if (!arrayBuffer.byteLength) continue;
    out.push({
      fileName: asset.name || `attachment-${Date.now()}`,
      mimeType: asset.mimeType || 'application/octet-stream',
      sizeBytes: asset.size ?? arrayBuffer.byteLength,
      arrayBuffer,
    });
  }
  return out;
}
