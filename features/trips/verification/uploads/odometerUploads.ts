import * as ImageManipulator from "expo-image-manipulator";
import * as FileSystem from "expo-file-system";
import { Platform } from "react-native";
import * as tripDocumentsService from "@/features/trips/services/tripDocuments.service";
import type { VerificationSide } from "../types";

const IMAGE_MAX_DIMENSION = 1600;
const IMAGE_QUALITY = 0.75;

export function verificationPhotoType(
  side: VerificationSide,
): tripDocumentsService.TripDocumentType {
  return side === "start" ? "odometer_start_photo" : "odometer_end_photo";
}

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

export async function compressVerificationPhoto(uri: string): Promise<ArrayBuffer> {
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

export async function uploadVerificationPhoto(params: {
  tripId: string;
  userId: string;
  side: VerificationSide;
  localUri: string;
}) {
  const arrayBuffer = await compressVerificationPhoto(params.localUri);
  return tripDocumentsService.uploadTripDocument(
    params.tripId,
    params.userId,
    {
      arrayBuffer,
      fileName: `odometer-${params.side}-${Date.now()}.jpg`,
      mimeType: "image/jpeg",
    },
    verificationPhotoType(params.side),
  );
}
