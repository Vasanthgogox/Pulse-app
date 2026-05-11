/**
 * Supabase Storage **render** URLs (CDN / imgproxy) — never hit Postgres.
 * Use for thin chat thumbnails when the bucket is public or URL is wrapped with a token.
 *
 * @see https://supabase.com/docs/guides/storage/serving/image-transformations
 */
import { getSupabaseBaseUrl } from "@/lib/supabase";
import { normalizeTripDocumentsStoragePath } from "./resolveChatDocumentUrl.util";

/** Default bucket for trip chat uploads after path normalization. */
export const TRIP_CHAT_IMAGE_BUCKET = "trip-documents" as const;

/**
 * Builds: `{SUPABASE_URL}/storage/v1/render/image/public/{bucket}/{objectPath}?width=&quality=`
 * Object path segments are encoded; slashes preserved between segments.
 */
export function buildSupabaseRenderImagePublicUrl(params: {
  storagePath: string;
  bucket?: string;
  width: number;
  quality: number;
}): string | null {
  const base = getSupabaseBaseUrl();
  if (!base) return null;
  const raw = String(params.storagePath ?? "").trim();
  if (/^https?:\/\//i.test(raw)) return appendImageTransformQuery(raw, params.width, params.quality);
  const path = normalizeTripDocumentsStoragePath(raw);
  if (!path) return null;
  const bucket = params.bucket ?? TRIP_CHAT_IMAGE_BUCKET;
  const encodedPath = path
    .split("/")
    .filter(Boolean)
    .map((seg) => encodeURIComponent(seg))
    .join("/");
  const root = base.replace(/\/+$/, "");
  const w = Math.max(16, Math.round(params.width));
  const q = Math.min(100, Math.max(1, Math.round(params.quality)));
  return `${root}/storage/v1/render/image/public/${encodeURIComponent(bucket)}/${encodedPath}?width=${w}&quality=${q}`;
}

/** Ensures transformation query params exist (WhatsApp-style thin fetches). */
export function appendImageTransformQuery(url: string, width: number, quality: number): string {
  const u = String(url ?? "").trim();
  if (!u.startsWith("http")) return u;
  try {
    const parsed = new URL(u);
    if (!parsed.searchParams.has("width")) {
      parsed.searchParams.set("width", String(Math.max(16, Math.round(width))));
    }
    if (!parsed.searchParams.has("quality")) {
      parsed.searchParams.set("quality", String(Math.min(100, Math.max(1, Math.round(quality)))));
    }
    return parsed.toString();
  } catch {
    const join = u.includes("?") ? "&" : "?";
    return `${u}${join}width=${Math.max(16, Math.round(width))}&quality=${Math.min(100, Math.max(1, Math.round(quality)))}`;
  }
}
