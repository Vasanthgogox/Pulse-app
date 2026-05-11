/**
 * ChatImage — document_share inline preview (images only).
 *
 * CDN-first: uses Supabase Image Transformations (default 300×300 @ q70) so the
 * Storage API returns a resized object, not the full binary. Module-level URL
 * caches are peeked synchronously on first paint — no blob download and no
 * storage client calls during render.
 */
import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Image, StyleSheet, View } from "react-native";
import type { ImageStyle, StyleProp } from "react-native";
import {
  peekChatImageThumbnailUrl,
  resolveChatImageThumbnail,
} from "../utils/resolveChatDocumentUrl.util";

const INLINE_W = 300;
const INLINE_H = 300;
const INLINE_Q = 70;
const THUMB_W = 150;
const THUMB_H = 150;
const THUMB_Q = 68;

interface ChatImageProps {
  storagePath: string;
  style?: StyleProp<ImageStyle>;
  thumbnail?: boolean;
}

function resolveKey(storagePath: string, thumbnail?: boolean): string {
  return `${storagePath}|${thumbnail ? "t" : "f"}`;
}

export function ChatImage({ storagePath, style, thumbnail }: ChatImageProps) {
  const w = thumbnail ? THUMB_W : INLINE_W;
  const h = thumbnail ? THUMB_H : INLINE_H;
  const q = thumbnail ? THUMB_Q : INLINE_Q;

  const [uri, setUri] = useState<string | null>(() =>
    storagePath ? peekChatImageThumbnailUrl(storagePath, w, h, q) : null,
  );
  const [loading, setLoading] = useState(
    () => !storagePath || !peekChatImageThumbnailUrl(storagePath, w, h, q),
  );
  const inFlightRef = useRef<string | null>(null);

  useEffect(() => {
    if (!storagePath) {
      setUri(null);
      setLoading(false);
      return;
    }
    const tw = thumbnail ? THUMB_W : INLINE_W;
    const th = thumbnail ? THUMB_H : INLINE_H;
    const tq = thumbnail ? THUMB_Q : INLINE_Q;
    const key = resolveKey(storagePath, thumbnail);
    const cached = peekChatImageThumbnailUrl(storagePath, tw, th, tq);
    if (cached) {
      setUri(cached);
      setLoading(false);
      return;
    }
    if (inFlightRef.current === key) return;
    inFlightRef.current = key;
    let cancelled = false;
    setLoading(true);
    void resolveChatImageThumbnail(storagePath, tw, th, tq).then((url) => {
      if (cancelled || inFlightRef.current !== key) return;
      inFlightRef.current = null;
      setUri(url);
      setLoading(false);
    });
    return () => {
      cancelled = true;
      inFlightRef.current = null;
    };
  }, [storagePath, thumbnail]);

  if (loading) {
    return (
      <View style={[s.placeholder, thumbnail && s.thumbnailPlaceholder, style as object]}>
        <ActivityIndicator size="small" color="#94a3b8" />
      </View>
    );
  }

  if (!uri) return null;

  return (
    <Image
      source={{ uri }}
      style={[thumbnail ? s.thumbnail : s.fullWidth, style]}
      resizeMode="cover"
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
  fullWidth: {
    width: "100%",
    height: 180,
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.04)",
  },
  thumbnail: {
    width: 80,
    height: 80,
    borderRadius: 10,
    backgroundColor: "rgba(0,0,0,0.04)",
  },
});
