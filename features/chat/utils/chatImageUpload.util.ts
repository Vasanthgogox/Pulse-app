/**
 * Chat image compress → upload pipeline.
 *
 * WhatsApp model:
 *   • Resize longest edge to ≤1080 px (keeps detail, halves typical camera file).
 *   • JPEG @ quality 0.75 (~200–500 KB for a typical photo).
 *   • Exact size limit: 5 MB raw accepted, rejected with a clear error above that.
 *
 * Slack model additions:
 *   • Prefetch CDN thumbnail URL is attached to the message metadata so the
 *     receiver never waits for a Storage round-trip on INSERT.
 *
 * Bucket: `trip-documents` (existing, RLS-gated, same bucket as POD photos).
 * Path:   `trip_chat/{conversationId}/{uuid}.jpg`
 */
import { supabase } from "@/lib/supabase";
import * as ImageManipulator from "expo-image-manipulator";
import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";
import { buildSupabaseRenderImagePublicUrl } from "./storageRenderImageUrl";

const CHAT_IMAGE_BUCKET = "trip-documents" as const;
// 800px / 0.65: ~35% smaller than 1080/0.75 — fits Indian 2G/3G upload budgets
// while remaining sharp enough for document and POD use-cases.
const MAX_LONG_EDGE = 800;
const JPEG_QUALITY = 0.65;
const MAX_RAW_BYTES = 5 * 1024 * 1024; // 5 MB

export interface ChatImageUploadResult {
  storagePath: string;
  mimeType: string;
  sizeBytes: number;
  /** Pre-built CDN thumbnail — avoids Storage round-trip on receiver's first render. */
  thumbUrl: string | null;
}

/**
 * Compress a local image URI (from ImagePicker or Camera) and upload it to
 * Supabase Storage.  Returns the storage path + CDN thumbnail URL.
 */
export async function compressAndUploadChatImage(
  localUri: string,
  conversationId: string,
): Promise<ChatImageUploadResult> {
  if (!localUri?.trim()) throw new Error("No image URI provided.");
  if (!conversationId?.trim()) throw new Error("Missing conversation ID.");

  // ── 1. Compress ─────────────────────────────────────────────────────────────
  const compressed = await ImageManipulator.manipulateAsync(
    localUri,
    [{ resize: { width: MAX_LONG_EDGE } }],
    {
      compress: JPEG_QUALITY,
      format: ImageManipulator.SaveFormat.JPEG,
    },
  );

  // ── 2. Read as ArrayBuffer ───────────────────────────────────────────────────
  const arrayBuffer = await uriToArrayBuffer(compressed.uri);
  const sizeBytes = arrayBuffer.byteLength;
  if (sizeBytes > MAX_RAW_BYTES) {
    throw new Error(
      `Image too large after compression (${(sizeBytes / 1024 / 1024).toFixed(1)} MB). Max 5 MB.`,
    );
  }

  // ── 3. Upload ────────────────────────────────────────────────────────────────
  const uuid = generateShortId();
  const storagePath = `trip_chat/${conversationId}/${uuid}.jpg`;
  const { error: uploadError } = await supabase()
    .storage.from(CHAT_IMAGE_BUCKET)
    .upload(storagePath, arrayBuffer, {
      contentType: "image/jpeg",
      upsert: false,
    });
  if (uploadError) throw new Error(uploadError.message);

  // ── 4. Pre-build CDN thumbnail (Slack-style thin metadata) ───────────────────
  const thumbUrl = buildSupabaseRenderImagePublicUrl({
    storagePath,
    bucket: CHAT_IMAGE_BUCKET,
    width: 400,
    quality: 65,
  });

  return { storagePath, mimeType: "image/jpeg", sizeBytes, thumbUrl };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function uriToArrayBuffer(uri: string): Promise<ArrayBuffer> {
  if (Platform.OS === "web") {
    // On web, expo-image-manipulator returns a data URI or blob URL.
    const response = await fetch(uri);
    return response.arrayBuffer();
  }
  // Native: read file via FileSystem and convert base64 → ArrayBuffer.
  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return base64ToArrayBuffer(base64);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  // atob is available in Hermes and JSC as of RN 0.64+.
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

function generateShortId(): string {
  // Crypto.randomUUID substitute: timestamp + random suffix.
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${ts}-${rand}`;
}
