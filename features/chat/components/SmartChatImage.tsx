/**
 * SmartChatImage — WhatsApp-style I/O-efficient chat image.
 *
 * THUMBNAIL (preview lane):
 *   Fetches a 200px-wide, quality-50 resized URL via Supabase Image Transformations.
 *   The server (imgproxy) delivers ~5 KB instead of the full ~2 MB binary.
 *   Both URLs are cached in module-level Maps with a 50-min TTL so re-renders
 *   and component remounts return the signed URL synchronously.
 *
 * FULL RESOLUTION:
 *   The original binary is fetched ONLY when the user taps the thumbnail.
 *   Until then, no full-size download is initiated.
 *
 * USAGE:
 *   <SmartChatImage storagePath="uuid/photo.jpg" isOwn={true} />
 */
import React from 'react';
import { OptimizedChatImage } from './OptimizedChatImage';

interface SmartChatImageProps {
  storagePath: string;
  isOwn?: boolean;
}

/**
 * Renders a 200px-wide @ quality 50 thumbnail with a full-size viewer modal.
 * Thumbnail lane: ~4 KB transfer (imgproxy resize + quality reduction).
 * Full resolution: fetched only when the user taps — zero bandwidth until then.
 */
export function SmartChatImage({ storagePath, isOwn = false }: SmartChatImageProps) {
  return (
    <OptimizedChatImage
      storagePath={storagePath}
      isOwn={isOwn}
      thumbWidth={200}
      thumbQuality={50}
    />
  );
}
