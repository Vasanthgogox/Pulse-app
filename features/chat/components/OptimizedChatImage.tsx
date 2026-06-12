/**
 * @deprecated Prefer {@link SmartChatImage} — this wrapper keeps legacy call sites
 * on the thin CDN + expo-image pipeline with optional message metadata.
 */
import React from "react";
import type { TripMessageRow } from "../types/chat.types";
import { SmartChatImage } from "./SmartChatImage";

export interface OptimizedChatImageProps {
  storagePath: string;
  isOwn?: boolean;
  thumbWidth?: number;
  thumbHeight?: number;
  thumbQuality?: number;
  message?: Pick<TripMessageRow, "metadata"> | null;
}

export function OptimizedChatImage({
  storagePath,
  isOwn = false,
  thumbWidth,
  thumbHeight,
  thumbQuality,
  message = null,
}: OptimizedChatImageProps) {
  return (
    <SmartChatImage
      storagePath={storagePath}
      isOwn={isOwn}
      message={message}
      thumbWidth={thumbWidth}
      thumbHeight={thumbHeight}
      thumbQuality={thumbQuality}
    />
  );
}
