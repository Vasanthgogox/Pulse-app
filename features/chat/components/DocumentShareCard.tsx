import React, { useMemo, useState } from "react";
import { LoadingIndicator } from "@/components/LoadingIndicator";
import {
  Alert,
  Linking,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { FileText, ExternalLink } from "lucide-react-native";
import type { DocumentShareMetadata, TripMessageRow } from "../types/chat.types";
import { resolveChatDocumentStorageUrl } from "../utils/resolveChatDocumentUrl.util";
import { CHAT_ACCENT, CHAT_ACCENT_SOFT } from "@/features/chat/chatTheme";
import { ChatImage } from "./ChatImage";

const IMAGE_EXT_RE =
  /\.(jpe?g|png|gif|webp|heic|heif|bmp|tif|tiff)(\?|#|$)/i;

function isImageDocument(meta: DocumentShareMetadata, storagePath: string): boolean {
  const mime = meta.mime_type?.trim().toLowerCase();
  if (mime?.startsWith("image/")) return true;
  const combined = `${meta.document_name ?? ""} ${storagePath}`.trim().toLowerCase();
  return IMAGE_EXT_RE.test(combined);
}

interface DocumentShareCardProps {
  message: TripMessageRow;
  isOwn: boolean;
}

function parseDocumentMeta(message: TripMessageRow): DocumentShareMetadata | null {
  const raw = message.metadata;
  if (raw == null) return null;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as DocumentShareMetadata;
    } catch {
      return null;
    }
  }
  return raw as DocumentShareMetadata;
}

export function DocumentShareCard({ message, isOwn }: DocumentShareCardProps) {
  const meta = useMemo(() => parseDocumentMeta(message), [message]);
  // Derive storagePath from meta and memoize so the string identity is stable.
  const storagePath = useMemo(() => String(meta?.storage_path ?? "").trim(), [meta]);

  /** HTTPS signed URL — resolved only on open so mounting the card never hits Storage. */
  const [linkUri, setLinkUri] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);

  if (!meta) return null;

  let displayTime = message.created_at;
  try {
    displayTime = new Date(message.created_at).toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    // keep raw
  }

  const showImagePreview = isImageDocument(meta, storagePath);

  const displayDocName =
    (meta.document_name && String(meta.document_name).trim()) ||
    storagePath.split("/").pop() ||
    "Document";
  const displayDocType = String(meta.document_type ?? "Document").trim() || "Document";

  const openInBrowser = async (url: string) => {
    try {
      if (Platform.OS === "web") {
        const w = (globalThis as { window?: Window }).window;
        w?.open?.(url, "_blank", "noopener,noreferrer");
        return;
      }
      await Linking.openURL(url);
    } catch (e) {
      Alert.alert(
        "Cannot open document",
        e instanceof Error ? e.message : "Try opening the trip in a browser or from trip details.",
        [{ text: "OK" }],
      );
    }
  };

  const handleOpen = async () => {
    setOpening(true);
    try {
      if (linkUri) {
        await openInBrowser(linkUri);
        return;
      }
      const url = await resolveChatDocumentStorageUrl(storagePath);
      if (url) {
        setLinkUri(url);
        await openInBrowser(url);
      } else {
        Alert.alert(
          "Preview unavailable",
          "We could not open this file. Ask your admin to apply the latest database migrations for trip-document storage access, or open the file from the trip detail screen.",
          [{ text: "OK" }],
        );
      }
    } finally {
      setOpening(false);
    }
  };

  return (
    <View style={[s.card, isOwn ? s.cardOwn : s.cardOther]}>
      <View style={s.header}>
        <View style={[s.iconWrap, { backgroundColor: isOwn ? "rgba(255,255,255,0.18)" : CHAT_ACCENT_SOFT }]}>
          <FileText size={16} color={isOwn ? "#fff" : CHAT_ACCENT} />
        </View>
        <View style={s.info}>
          <Text style={[s.docType, isOwn && s.textOwn]} numberOfLines={1}>
            {displayDocType.toUpperCase()}
          </Text>
          <Text style={[s.docName, isOwn && s.textOwn]} numberOfLines={1}>
            {displayDocName}
          </Text>
        </View>
      </View>

      {showImagePreview ? (
        <View style={s.imagePreviewWrap}>
          <ChatImage storagePath={storagePath} style={s.imagePreview} />
        </View>
      ) : null}

      <TouchableOpacity
        style={[s.openBtn, isOwn ? s.openBtnOwn : s.openBtnOther]}
        onPress={handleOpen}
        disabled={opening}
        activeOpacity={0.8}
      >
        {opening ? (
          <LoadingIndicator size="small" color={isOwn ? CHAT_ACCENT : "#fff"} />
        ) : (
          <>
            <ExternalLink size={12} color={isOwn ? CHAT_ACCENT : "#fff"} />
            <Text style={[s.openText, isOwn ? s.openTextOwn : s.openTextOther]}>
              {linkUri ? "Open / download" : "View document"}
            </Text>
          </>
        )}
      </TouchableOpacity>

      <Text style={[s.time, isOwn && { textAlign: "right", color: "rgba(255,255,255,0.6)" }]}>
        {displayTime} · {message.sender_name.toUpperCase()}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    borderRadius: 18,
    padding: 13,
    maxWidth: "72%",
    borderWidth: 1,
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  cardOwn: {
    backgroundColor: CHAT_ACCENT,
    borderColor: "transparent",
    alignSelf: "flex-end",
    shadowColor: CHAT_ACCENT,
  },
  cardOther: {
    backgroundColor: "#fff",
    borderColor: "#e5e7eb",
    alignSelf: "flex-start",
    shadowColor: "#0f172a",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  info: { flex: 1, minWidth: 0 },
  docType: {
    fontSize: 9,
    fontWeight: "900",
    color: "#64748b",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  docName: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0f172a",
    marginTop: 1,
  },
  textOwn: { color: "#fff" },
  previewSlot: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  imagePreviewWrap: {
    borderRadius: 12,
    overflow: "hidden",
    marginBottom: 10,
    maxHeight: 200,
    backgroundColor: "rgba(0,0,0,0.06)",
  },
  imagePreview: {
    width: "100%",
    height: 180,
    backgroundColor: "rgba(0,0,0,0.04)",
  },
  resolveErr: {
    fontSize: 11,
    color: "#b91c1c",
    fontWeight: "600",
    marginBottom: 8,
    lineHeight: 15,
  },
  resolveErrOwn: { color: "#fecaca" },
  openBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 12,
    paddingVertical: 8,
    marginBottom: 8,
  },
  openBtnOwn: { backgroundColor: "#fff" },
  openBtnOther: { backgroundColor: "#3b82f6" },
  openText: { fontSize: 12, fontWeight: "700" },
  openTextOwn: { color: CHAT_ACCENT },
  openTextOther: { color: "#fff" },
  time: {
    fontSize: 9,
    color: "#94a3b8",
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
});
