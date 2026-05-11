/**
 * OptimizedChatImage — Supabase Image Transformation-backed chat image.
 *
 * PROBLEM:
 *   Loading the original file for every chat thumbnail was exhausting the
 *   Supabase connection pool. A 2MB POD photo loaded 20 times in a busy
 *   thread consumed ~40MB of bandwidth and held connections open for seconds.
 *
 * SOLUTION:
 *   - Thumbnail mode: request a 150×150, quality-60 transformed URL via
 *     Supabase's imgproxy integration (createSignedUrl + transform option).
 *     The server resizes the image before delivery — ~5KB instead of ~2MB.
 *   - Full-size mode: loaded ONLY when the user taps the thumbnail.
 *     Uses the original signed URL (or blob: URL on web for CORS safety).
 *   - Both URL types are cached in module-level Maps with 50-min TTL.
 *     Re-renders and component remounts return the cached URL synchronously.
 *
 * USAGE:
 *   <OptimizedChatImage
 *     storagePath="abc-uuid/filename.jpg"
 *     isOwn={true}
 *   />
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { X, ZoomIn } from 'lucide-react-native';
import {
  resolveChatDocumentStorageUrl,
  resolveChatImageThumbnail,
} from '../utils/resolveChatDocumentUrl.util';
import Theme from '@/constants/Theme';

interface OptimizedChatImageProps {
  storagePath: string;
  isOwn?: boolean;
  /** Thumbnail width passed to Supabase Image Transformations (default 300). */
  thumbWidth?: number;
  /** Thumbnail height passed to Supabase Image Transformations (default 300). */
  thumbHeight?: number;
  /** Thumbnail quality 1-100 passed to Supabase Image Transformations (default 65). */
  thumbQuality?: number;
}

type LoadState = 'idle' | 'loading' | 'ready' | 'error';

export function OptimizedChatImage({
  storagePath,
  isOwn = false,
  thumbWidth   = 300,
  thumbHeight  = 300,
  thumbQuality = 65,
}: OptimizedChatImageProps) {
  const [thumbUri, setThumbUri]         = useState<string | null>(null);
  const [thumbState, setThumbState]     = useState<LoadState>('idle');
  const [fullUri, setFullUri]           = useState<string | null>(null);
  const [fullState, setFullState]       = useState<LoadState>('idle');
  const [modalVisible, setModalVisible] = useState(false);

  // Guard: prevents the effect from re-running when storagePath hasn't changed.
  const resolvedThumbRef = useRef<string | null>(null);

  // ── Thumbnail resolution ──────────────────────────────────────────────────
  useEffect(() => {
    if (!storagePath || resolvedThumbRef.current === storagePath) return;
    resolvedThumbRef.current = storagePath;

    let cancelled = false;
    setThumbState('loading');

    void resolveChatImageThumbnail(storagePath, thumbWidth, thumbHeight, thumbQuality).then(url => {
      if (cancelled) return;
      if (url) {
        setThumbUri(url);
        setThumbState('ready');
      } else {
        setThumbState('error');
      }
    });

    return () => { cancelled = true; };
  }, [storagePath, thumbWidth, thumbHeight, thumbQuality]);

  // ── Full-size resolution (on-demand when user taps) ───────────────────────
  const loadFullSize = useCallback(async () => {
    if (fullUri || fullState === 'loading') {
      setModalVisible(true);
      return;
    }
    setFullState('loading');
    const url = await resolveChatDocumentStorageUrl(storagePath);
    if (url) {
      setFullUri(url);
      setFullState('ready');
    } else {
      setFullState('error');
    }
    setModalVisible(true);
  }, [storagePath, fullUri, fullState]);

  // ── Render ────────────────────────────────────────────────────────────────
  if (thumbState === 'error') {
    return (
      <View style={[s.placeholder, isOwn && s.placeholderOwn]}>
        <Text style={s.errorText}>Image unavailable</Text>
      </View>
    );
  }

  if (thumbState === 'loading' || thumbState === 'idle') {
    return (
      <View style={[s.placeholder, isOwn && s.placeholderOwn]}>
        <ActivityIndicator size="small" color={isOwn ? '#e0e7ff' : '#64748b'} />
      </View>
    );
  }

  return (
    <>
      <TouchableOpacity
        style={s.thumbWrap}
        onPress={loadFullSize}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel="View full image"
      >
        <Image
          source={{ uri: thumbUri! }}
          style={s.thumb}
          resizeMode="cover"
          accessibilityLabel="Chat image thumbnail"
        />
        <View style={s.zoomBadge}>
          <ZoomIn size={12} color="#fff" strokeWidth={2.5} />
        </View>
      </TouchableOpacity>

      {/* Full-size viewer modal */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
        statusBarTranslucent
      >
        <SafeAreaView style={s.modalBg}>
          <TouchableOpacity
            style={s.modalClose}
            onPress={() => setModalVisible(false)}
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <X size={22} color="#fff" />
          </TouchableOpacity>

          {fullState === 'loading' && (
            <View style={s.modalLoading}>
              <ActivityIndicator size="large" color="#fff" />
              <Text style={s.modalLoadingText}>Loading full image…</Text>
            </View>
          )}

          {fullState === 'ready' && fullUri && (
            <Pressable style={s.modalImgWrap} onPress={() => setModalVisible(false)}>
              <Image
                source={{ uri: fullUri }}
                style={s.modalImg}
                resizeMode="contain"
                accessibilityLabel="Full-size chat image"
              />
            </Pressable>
          )}

          {fullState === 'error' && (
            <View style={s.modalLoading}>
              <Text style={[s.modalLoadingText, { color: '#fca5a5' }]}>
                Could not load full image
              </Text>
            </View>
          )}
        </SafeAreaView>
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  placeholder: {
    width: '100%',
    height: 160,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderOwn: {
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  errorText: {
    fontSize: 11,
    color: '#94a3b8',
    fontWeight: '600',
  },
  thumbWrap: {
    borderRadius: 14,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: 'rgba(0,0,0,0.04)',
  },
  thumb: {
    width: '100%',
    height: 180,
  },
  zoomBadge: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Modal
  modalBg: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    justifyContent: 'center',
  },
  modalClose: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 56 : 16,
    right: 16,
    zIndex: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalImgWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalImg: {
    width: '100%',
    height: '85%',
  },
  modalLoading: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    flex: 1,
  },
  modalLoadingText: {
    fontSize: 13,
    color: '#94a3b8',
    fontWeight: '600',
  },
});
