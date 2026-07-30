import * as DocumentPicker from "expo-document-picker";
// expo-file-system SDK 54 moved readAsStringAsync/EncodingType to the legacy entry.
import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";

export type PickedChatFile = {
  fileName: string;
  mimeType: string;
  arrayBuffer: ArrayBuffer;
};

async function readUriAsArrayBuffer(uri: string): Promise<ArrayBuffer> {
  if (Platform.OS === "web") {
    const res = await fetch(uri);
    return res.arrayBuffer();
  }
  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: "base64",
  });
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/** Pick a single file from gallery/files for chat document upload. */
export async function pickChatDocumentFile(): Promise<PickedChatFile | null> {
  const res = await DocumentPicker.getDocumentAsync({
    multiple: false,
    copyToCacheDirectory: true,
    type: ["application/pdf", "image/*"],
  });
  if (res.canceled || !res.assets?.[0]) return null;
  const asset = res.assets[0];
  const arrayBuffer = await readUriAsArrayBuffer(asset.uri);
  if (!arrayBuffer.byteLength) return null;
  return {
    fileName: asset.name || `document-${Date.now()}.pdf`,
    mimeType: asset.mimeType || "application/octet-stream",
    arrayBuffer,
  };
}
