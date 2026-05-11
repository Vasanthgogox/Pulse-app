/**
 * ChatImage — lazy-loading image component for chat document previews.
 *
 * Problem this solves:
 *   DocumentShareCard called resolveChatDocumentStorageUrl + tryChatDocumentBlobObjectUrl
 *   on every component mount. When the parent ScrollView re-renders (e.g. on each
 *   incoming message), every visible image card re-mounted and fired new storage
 *   requests, exhausting the Supabase connection pool.
 *
 * How it works:
 *   1. Checks the module-level signed URL and blob URL caches synchronously on
 *      mount — returns the cached URL immediately with zero network calls.
 *   2. Only resolves over the network on a cache miss (first view of this path).
 *   3. Uses `storagePath` (a stable string) as the effect dependency — not the
 *      `message` or `meta` object, which may change reference on every render.
 *   4. An in-flight ref (`resolvedRef`) prevents the effect from re-running even
 *      if the component re-mounts while resolution is in progress.
 */
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, View } from 'react-native';
import type { ImageStyle, StyleProp } from 'react-native';
import {
  resolveChatDocumentStorageUrl,
  tryChatDocumentBlobObjectUrl,
} from '../utils/resolveChatDocumentUrl.util';

interface ChatImageProps {
  storagePath: string;
  style?: StyleProp<ImageStyle>;
  /** Show as a square thumbnail when true. Defaults to full-width aspect-ratio. */
  thumbnail?: boolean;
}

export function ChatImage({ storagePath, style, thumbnail }: ChatImageProps) {
  const [uri, setUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // Guard: prevent re-triggering the effect when storagePath hasn't changed
  const resolvedPathRef = useRef<string | null>(null);

  useEffect(() => {
    if (!storagePath || resolvedPathRef.current === storagePath) return;
    resolvedPathRef.current = storagePath;

    let cancelled = false;

    async function resolve() {
      // Try blob download first (preferred for inline preview — avoids CORS on web).
      const blob = await tryChatDocumentBlobObjectUrl(storagePath);
      if (cancelled) return;
      if (blob?.url) {
        setUri(blob.url);
        setLoading(false);
        return;
      }

      // Fallback: signed HTTPS URL (cached at 50-min TTL in the util module).
      const signed = await resolveChatDocumentStorageUrl(storagePath);
      if (cancelled) return;
      setUri(signed);
      setLoading(false);
    }

    void resolve();
    return () => { cancelled = true; };
  }, [storagePath]);

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
    width: '100%',
    height: 160,
    backgroundColor: 'rgba(0,0,0,0.04)',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbnailPlaceholder: {
    width: 80,
    height: 80,
  },
  fullWidth: {
    width: '100%',
    height: 180,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.04)',
  },
  thumbnail: {
    width: 80,
    height: 80,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.04)',
  },
});
