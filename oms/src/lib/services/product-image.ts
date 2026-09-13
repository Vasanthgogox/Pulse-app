import { getIdentityDb } from '@/lib/supabase';

export const PRODUCT_IMAGE_BUCKET = 'org-assets';
export const PRODUCT_IMAGE_PREFIX = 'product-images/';

const MAX_EDGE_PX = 1280;
const JPEG_QUALITY = 0.82;
const MAX_BYTES = 5 * 1024 * 1024;

export function productImagePublicUrl(path: string | null | undefined): string | null {
  const trimmed = (path ?? '').trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('blob:')) {
    return trimmed;
  }
  const db = getIdentityDb();
  if (!db) return null;
  return db.storage.from(PRODUCT_IMAGE_BUCKET).getPublicUrl(trimmed).data.publicUrl;
}

async function compressToJpeg(file: File): Promise<Blob> {
  if (typeof createImageBitmap !== 'function') {
    if (file.size > MAX_BYTES) {
      throw new Error('Image is too large. Use a photo under 5 MB.');
    }
    return file;
  }
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE_PX / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not process image');
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY);
  });
  if (!blob) throw new Error('Could not process image');
  if (blob.size > MAX_BYTES) {
    throw new Error('Image is too large. Try a smaller photo.');
  }
  return blob;
}

export async function uploadCommerceProductImage(
  organizationId: string,
  productId: string,
  file: File,
): Promise<string> {
  const db = getIdentityDb();
  if (!db) throw new Error('Supabase not configured');
  if (!file.type.startsWith('image/')) {
    throw new Error('Choose a JPEG, PNG, or WebP image.');
  }
  const jpeg = await compressToJpeg(file);
  const path = `${PRODUCT_IMAGE_PREFIX}${organizationId}/${productId}-${Date.now()}.jpg`;
  const { error } = await db.storage.from(PRODUCT_IMAGE_BUCKET).upload(path, jpeg, {
    contentType: 'image/jpeg',
    upsert: true,
    cacheControl: '3600',
  });
  if (error) throw new Error(error.message);
  return path;
}

export async function removeCommerceProductImage(path: string): Promise<void> {
  const trimmed = path.trim();
  if (!trimmed || trimmed.startsWith('http')) return;
  const db = getIdentityDb();
  if (!db) return;
  await db.storage.from(PRODUCT_IMAGE_BUCKET).remove([trimmed]);
}
