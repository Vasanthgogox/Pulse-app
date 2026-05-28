import * as ImageManipulator from "expo-image-manipulator";
import * as FileSystem from "expo-file-system";
import { Platform } from "react-native";

const IMAGE_MAX_DIMENSION = 1600;
const IMAGE_QUALITY = 0.75;

async function readArrayBufferFromUri(uri: string): Promise<ArrayBuffer> {
  if (Platform.OS === "web") {
    const response = await fetch(uri);
    return response.arrayBuffer();
  }
  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: "base64" as const,
  });
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)).buffer;
}

export async function compressOperationsPhoto(uri: string): Promise<ArrayBuffer> {
  if (Platform.OS === "web") {
    const response = await fetch(uri);
    return response.arrayBuffer();
  }
  const manipulated = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: IMAGE_MAX_DIMENSION } }],
    { compress: IMAGE_QUALITY, format: ImageManipulator.SaveFormat.JPEG },
  );
  return readArrayBufferFromUri(manipulated.uri);
}
