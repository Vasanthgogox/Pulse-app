/**
 * DocumentPreviewModal — in-app document/image preview (Slack/WhatsApp style).
 *
 * Images  → full-screen expo-image with close button (no external browser).
 * PDF/other → expo-web-browser in-app session (dismisses back into the app).
 *
 * Never pre-fetches: the signed URL is resolved only when the user taps Open.
 */
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  loadImageNaturalSize,
  resolveFitImageLayout,
} from "@/features/chat/utils/fitImageInViewport.util";
import { WEB_APP_VIEWPORT_STYLE } from "@/lib/webViewportHeight";
import { Image } from "expo-image";
import * as WebBrowser from "expo-web-browser";
import { X } from "lucide-react-native";

const IMAGE_MIME_RE = /^image\//i;
const IMAGE_EXT_RE = /\.(jpe?g|png|gif|webp|heic|heif|bmp)(\?|$)/i;

export function isImageMime(mime?: string | null, name?: string | null): boolean {
  if (mime && IMAGE_MIME_RE.test(mime)) return true;
  if (name && IMAGE_EXT_RE.test(name)) return true;
  return false;
}

export interface DocumentPreviewProps {
  /** Resolved HTTPS URL to the document (signed or public). */
  url: string;
  mimeType?: string | null;
  fileName?: string | null;
  onClose: () => void;
}

/** Full-screen image lightbox — natural aspect ratio, centered, never upscaled. */
function ImageLightbox({ url, fileName, onClose }: DocumentPreviewProps) {
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(
    null,
  );
  const { width: windowW, height: windowH } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const viewportHeight = Math.max(1, windowH - insets.top - insets.bottom);

  const applyNaturalSize = useCallback((w: number, h: number) => {
    if (w > 0 && h > 0) {
      setNaturalSize({ width: w, height: h });
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    setNaturalSize(null);
    void loadImageNaturalSize(url).then((size) => {
      if (cancelled || !size) return;
      applyNaturalSize(size.width, size.height);
    });
    return () => {
      cancelled = true;
    };
  }, [url, applyNaturalSize]);

  const imageLayout = naturalSize
    ? resolveFitImageLayout(naturalSize, windowW, viewportHeight, {
        horizontal: 20,
        top: 64,
        bottom: 28,
      })
    : null;

  const imageNode =
    naturalSize && imageLayout ? (
      <Image
        source={{ uri: url }}
        style={{
          width: imageLayout.width,
          height: imageLayout.height,
        }}
        contentFit="contain"
        transition={180}
        onLoad={(event) => {
          const w = event.source.width;
          const h = event.source.height;
          if (w > 0 && h > 0) applyNaturalSize(w, h);
        }}
      />
    ) : null;

  return (
    <Modal
      visible
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <SafeAreaView
        style={[
          s.fullScreen,
          Platform.OS === "web" ? (WEB_APP_VIEWPORT_STYLE as object) : null,
        ]}
      >
        <Pressable
          style={s.closeBtn}
          onPress={onClose}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Close preview"
        >
          <X size={22} color="#fff" strokeWidth={2.2} />
        </Pressable>
        {fileName ? (
          <Text style={s.fileName} numberOfLines={1}>
            {fileName}
          </Text>
        ) : null}
        {!naturalSize ? (
          <ActivityIndicator style={s.loadingCenter} color="#fff" size="large" />
        ) : null}
        {imageLayout?.scrollable ? (
          <ScrollView
            style={s.previewScroll}
            contentContainerStyle={[
              s.previewScrollContent,
              {
                minHeight: viewportHeight,
                paddingTop: 64,
                paddingBottom: 28,
              },
            ]}
            showsVerticalScrollIndicator
            centerContent
          >
            {imageNode}
          </ScrollView>
        ) : (
          <View style={[s.previewCenter, { minHeight: viewportHeight }]}>
            {imageNode}
          </View>
        )}
        {!naturalSize ? (
          <Image
            source={{ uri: url }}
            style={s.measureImage}
            contentFit="contain"
            onLoad={(event) => {
              const w = event.source.width;
              const h = event.source.height;
              if (w > 0 && h > 0) applyNaturalSize(w, h);
            }}
            onError={() => {
              applyNaturalSize(Math.max(1, windowW - 40), Math.max(1, viewportHeight - 92));
            }}
          />
        ) : null}
      </SafeAreaView>
    </Modal>
  );
}

/**
 * Trigger props — passed from DocumentShareCard to open the correct preview.
 * Keeps the Card stateless; DocumentPreviewTrigger owns the open/close cycle.
 */
export interface DocumentPreviewTriggerProps {
  /** Already-resolved URL (caller must resolve the signed URL first). */
  resolvedUrl: string | null;
  /** Whether the URL is currently being resolved. */
  resolving: boolean;
  mimeType?: string | null;
  fileName?: string | null;
  /** Called by the trigger to open the preview. */
  onOpen: () => void;
}

/**
 * Headless hook: returns `open(url, mime, name)` which opens the right viewer.
 * For images: mounts `ImageLightbox` in a Modal.
 * For PDF/other: launches `WebBrowser.openBrowserAsync` (in-app, dismissable).
 */
export function useDocumentPreview() {
  const [lightbox, setLightbox] = useState<{
    url: string;
    mime?: string | null;
    name?: string | null;
  } | null>(null);

  const open = useCallback(
    async (url: string, mime?: string | null, name?: string | null) => {
      if (!url) return;
      if (isImageMime(mime, name)) {
        setLightbox({ url, mime, name });
        return;
      }
      if (Platform.OS === "web") {
        (globalThis as { window?: Window }).window?.open?.(url, "_blank", "noopener,noreferrer");
        return;
      }
      await WebBrowser.openBrowserAsync(url, {
        presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
        enableBarCollapsing: true,
        showTitle: true,
      });
    },
    [],
  );

  const close = useCallback(() => setLightbox(null), []);

  const node = lightbox ? (
    <ImageLightbox
      url={lightbox.url}
      mimeType={lightbox.mime}
      fileName={lightbox.name}
      onClose={close}
    />
  ) : null;

  return { open, node };
}

const s = StyleSheet.create({
  fullScreen: {
    flex: 1,
    backgroundColor: "#000",
  },
  closeBtn: {
    position: "absolute",
    top: 52,
    right: 16,
    zIndex: 10,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  fileName: {
    position: "absolute",
    top: 56,
    left: 16,
    right: 64,
    zIndex: 10,
    fontSize: 13,
    fontWeight: "600",
    color: "rgba(255,255,255,0.85)",
  },
  loadingCenter: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 5,
  },
  previewScroll: {
    flex: 1,
    width: "100%",
  },
  previewScrollContent: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
    flexGrow: 1,
  },
  previewCenter: {
    flex: 1,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
    paddingTop: 64,
    paddingBottom: 28,
  },
  measureImage: {
    width: 1,
    height: 1,
    opacity: 0,
    position: "absolute",
  },
});
