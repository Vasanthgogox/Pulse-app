/** A hydrated/signed remote URL (already uploaded) — not an uploadable local URI. */
function isRemotePhotoUri(uri: string): boolean {
  return uri.startsWith("http://") || uri.startsWith("https://");
}

/** Only local picker/camera URIs should be uploaded — skip hydrated signed URLs. */
export function uploadableOdometerPhotoUri(uri: string | null | undefined): string | null {
  const trimmed = uri?.trim();
  if (!trimmed || isRemotePhotoUri(trimmed)) return null;
  return trimmed;
}
