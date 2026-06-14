import { isRemotePhotoUri } from "@/features/trips/operations/uploads/photoUploads";

/** Only local picker/camera URIs should be uploaded — skip hydrated signed URLs. */
export function uploadableOdometerPhotoUri(uri: string | null | undefined): string | null {
  const trimmed = uri?.trim();
  if (!trimmed || isRemotePhotoUri(trimmed)) return null;
  return trimmed;
}
