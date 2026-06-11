/**
 * DocumentPreviewModal — in-app document/image preview (Slack/WhatsApp style).
 *
 * Images  → full-screen expo-image with close button (no external browser).
 * PDF/other → expo-web-browser in-app session (dismisses back into the app).
 *
 * Never pre-fetches: the signed URL is resolved only when the user taps Open.
 */
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Image } from "expo-image";
import * as WebBrowser from "expo-web-browser";
import { X, ZoomIn } from "lucide-react-native";

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

/** Full-screen image lightbox */
function ImageLightbox({ url, fileName, onClose }: DocumentPreviewProps) {
  const [loaded, setLoaded] = useState(false);

  return (
    <Modal
      visible
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <SafeAreaView style={s.fullScreen}>
        <Pressable style={s.closeBtn} onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close preview">
          <X size={22} color="#fff" strokeWidth={2.2} />
        </Pressable>
        {fileName ? (
          <Text style={s.fileName} numberOfLines={1}>{fileName}</Text>
        ) : null}
        {!loaded ? (
          <ActivityIndicator style={s.loadingCenter} color="#fff" size="large" />
        ) : null}
        <Image
          source={{ uri: url }}
          style={s.fullImage}
          contentFit="contain"
          onLoad={() => setLoaded(true)}
          onError={() => setLoaded(true)}
          transition={180}
        />
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
      // PDF / other — open in in-app browser so user stays in the app.
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

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  fullScreen: {
    flex: 1,
    backgroundColor: "#000",
    justifyContent: "center",
    alignItems: "center",
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
    position: "absolute",
    zIndex: 5,
  },
  fullImage: {
    width: "100%",
    height: "100%",
  },
});
