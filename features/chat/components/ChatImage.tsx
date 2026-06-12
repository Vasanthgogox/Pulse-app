/**
 * ChatImage — document_share inline preview (images only).
 *
 * CDN-first: fetch size matches on-screen dimensions × DPR so retina previews
 * stay sharp without downloading the full original.
 */
import { LoadingIndicator } from "@/components/LoadingIndicator";
import { chatPreviewFetchForDisplay } from "@/features/chat/utils/chatPreviewTransform.util";
import { Image } from "expo-image";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, View, type ImageStyle, type StyleProp } from "react-native";
import {
  peekChatImageThumbnailUrl,
  resolveChatImageThumbnail,
} from "../utils/resolveChatDocumentUrl.util";

const DEFAULT_INLINE_W = 300;
const DEFAULT_INLINE_H = 180;
const DEFAULT_THUMB_W = 156;
const DEFAULT_THUMB_H = 96;

interface ChatImageProps {
  storagePath: string;
  style?: StyleProp<ImageStyle>;
  thumbnail?: boolean;
  /** On-screen width — used to size the CDN transform (DPR-aware). */
  displayWidth?: number;
  /** On-screen height — used to size the CDN transform (DPR-aware). */
  displayHeight?: number;
  contentFit?: "cover" | "contain";
}

function resolveKey(
  storagePath: string,
  w: number,
  h: number,
  q: number,
  resize: "cover" | "contain",
): string {
  return `${storagePath}|${w}|${h}|${q}|${resize}`;
}

function readDisplaySize(
  style: StyleProp<ImageStyle> | undefined,
  thumbnail: boolean | undefined,
  displayWidth?: number,
  displayHeight?: number,
): { w: number; h: number } {
  if (displayWidth && displayHeight) {
    return { w: displayWidth, h: displayHeight };
  }
  const flat = StyleSheet.flatten(style);
  const w = typeof flat?.width === "number" ? flat.width : thumbnail ? DEFAULT_THUMB_W : DEFAULT_INLINE_W;
  const h = typeof flat?.height === "number" ? flat.height : thumbnail ? DEFAULT_THUMB_H : DEFAULT_INLINE_H;
  return { w, h };
}

export function ChatImage({
  storagePath,
  style,
  thumbnail,
  displayWidth,
  displayHeight,
  contentFit,
}: ChatImageProps) {
  const display = readDisplaySize(style, thumbnail, displayWidth, displayHeight);
  const resize = contentFit ?? (thumbnail ? "cover" : "contain");
  const fetch = useMemo(
    () => chatPreviewFetchForDisplay(display.w, display.h, resize),
    [display.w, display.h, resize],
  );

  const [uri, setUri] = useState<string | null>(() =>
    storagePath
      ? peekChatImageThumbnailUrl(
          storagePath,
          fetch.width,
          fetch.height,
          fetch.quality,
          resize,
        )
      : null,
  );
  const [loading, setLoading] = useState(
    () =>
      !storagePath ||
      !peekChatImageThumbnailUrl(
        storagePath,
        fetch.width,
        fetch.height,
        fetch.quality,
        resize,
      ),
  );
  const inFlightRef = useRef<string | null>(null);

  useEffect(() => {
    if (!storagePath) {
      setUri(null);
      setLoading(false);
      return;
    }
    const key = resolveKey(storagePath, fetch.width, fetch.height, fetch.quality, resize);
    const cached = peekChatImageThumbnailUrl(
      storagePath,
      fetch.width,
      fetch.height,
      fetch.quality,
      resize,
    );
    if (cached) {
      setUri(cached);
      setLoading(false);
      return;
    }
    if (inFlightRef.current === key) return;
    inFlightRef.current = key;
    let cancelled = false;
    setLoading(true);
    void resolveChatImageThumbnail(
      storagePath,
      fetch.width,
      fetch.height,
      fetch.quality,
      resize,
    ).then((url) => {
      if (cancelled || inFlightRef.current !== key) return;
      inFlightRef.current = null;
      setUri(url);
      setLoading(false);
    });
    return () => {
      cancelled = true;
      inFlightRef.current = null;
    };
  }, [storagePath, fetch.width, fetch.height, fetch.quality, resize]);

  if (loading) {
    return (
      <View style={[s.placeholder, thumbnail && s.thumbnailPlaceholder, style as object]}>
        <LoadingIndicator size="small" color="#94a3b8" />
      </View>
    );
  }

  if (!uri) return null;

  return (
    <Image
      source={{ uri }}
      style={style}
      contentFit={resize}
      transition={100}
      cachePolicy="memory-disk"
      recyclingKey={uri}
      accessibilityLabel="Document preview"
    />
  );
}

const s = StyleSheet.create({
  placeholder: {
    width: "100%",
    height: 160,
    backgroundColor: "rgba(0,0,0,0.04)",
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  thumbnailPlaceholder: {
    width: 80,
    height: 80,
  },
});
