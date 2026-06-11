import React, { useCallback, useEffect, useMemo, useState } from "react";
import { LoadingIndicator } from "@/components/LoadingIndicator";
import { CHAT_ACCENT, CHAT_TEXT_MUTED, CHAT_TEXT_SECONDARY } from "@/features/chat/chatTheme";
import { ChatImage } from "@/features/chat/components/ChatImage";
import { SLACK_TYPE } from "@/features/chat/components/mobile/chatSlackMobile.styles";
import {
  listChatHubDocuments,
  uploadChatHubTripDocument,
  type ChatHubDocument,
  type ChatHubEntityType,
} from "@/features/chat/services/chatDocumentHub.service";
import { pickChatDocumentFile } from "@/features/chat/utils/chatDocumentPick.util";
import {
  documentExtensionAccent,
  isHubDocumentImage,
} from "@/features/chat/utils/documentShareDisplay.util";
import { normalizeTripDocumentsStoragePath } from "@/features/chat/utils/resolveChatDocumentUrl.util";
import {
  CheckCircle,
  FileText,
  Plus,
  RefreshCw,
  Send,
  Truck,
  User,
  X,
} from "lucide-react-native";
import {
  Alert,
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  View,
} from "react-native";

export type DocumentSharePayload = {
  key: string;
  label: string;
  storage_path: string;
  entity_type: ChatHubEntityType;
  entity_id: string;
  mime_type?: string | null;
  document_type?: string;
};

interface DocumentShareSheetProps {
  visible: boolean;
  tripId: string | null;
  vehicleId: string | null;
  driverId: string | null;
  orgId: string | null;
  userId: string | null;
  onClose: () => void;
  onShare: (doc: DocumentSharePayload) => void | Promise<void>;
  alreadySentPaths?: string[];
}

type HubSection = {
  title: string;
  entity: ChatHubEntityType;
  data: ChatHubDocument[];
};

const SECTION_META: Record<
  ChatHubEntityType,
  { title: string; empty: string; Icon: typeof Truck }
> = {
  trip: {
    title: "Trip documents",
    empty: "No trip files yet — add POD, manifest, or receipts.",
    Icon: FileText,
  },
  vehicle: {
    title: "Vehicle documents",
    empty: "RC, insurance, fitness, and PUC appear here when uploaded.",
    Icon: Truck,
  },
  driver: {
    title: "Driver documents",
    empty: "Driver licence and ID docs from the driver profile.",
    Icon: User,
  },
};

const THUMB_SIZE = 40;

function formatUploadedAt(iso: string | null | undefined): string | null {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return null;
  }
}

function pathAlreadySent(storagePath: string, alreadySentPaths: string[]): boolean {
  const normalized = normalizeTripDocumentsStoragePath(storagePath);
  if (!normalized) return false;
  return alreadySentPaths.some(
    (p) => normalizeTripDocumentsStoragePath(p) === normalized,
  );
}

function DocHubThumb({ item }: { item: ChatHubDocument }) {
  const ext =
    item.label.split(".").pop()?.toUpperCase().slice(0, 4) ||
    (item.document_type ?? "DOC").slice(0, 4).toUpperCase();
  const accent = documentExtensionAccent(ext);
  const isImage = isHubDocumentImage(item);

  if (isImage && item.storage_path) {
    return (
      <View style={s.docThumb}>
        <ChatImage
          storagePath={item.storage_path}
          thumbnail
          style={s.docThumbImage}
        />
      </View>
    );
  }

  return (
    <View style={[s.docThumb, s.docThumbIcon, { backgroundColor: `${accent}12` }]}>
      <FileText size={15} color={accent} strokeWidth={2.1} />
      {ext ? (
        <Text style={[s.docThumbExt, { color: accent }]} numberOfLines={1}>
          {ext}
        </Text>
      ) : null}
    </View>
  );
}

function confirmDocumentShare(
  payload: DocumentSharePayload,
  resend: boolean,
  onConfirm: () => void,
) {
  if (resend) {
    Alert.alert(
      "Send again?",
      `Share "${payload.label}" in this chat again?`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Send again", onPress: onConfirm },
      ],
    );
    return;
  }
  Alert.alert(
    "Send document?",
    `Share "${payload.label}" in this chat?`,
    [
      { text: "Cancel", style: "cancel" },
      { text: "Send", onPress: onConfirm },
    ],
  );
}

function DocRowActions({
  alreadySent,
  isSharing,
  disabled,
  onSend,
  onSendAgain,
}: {
  alreadySent: boolean;
  isSharing: boolean;
  disabled: boolean;
  onSend: () => void;
  onSendAgain: () => void;
}) {
  if (isSharing) {
    return (
      <View style={s.actionsCol}>
        <LoadingIndicator size="small" color={CHAT_ACCENT} />
        <Text style={s.actionMeta}>Sending…</Text>
      </View>
    );
  }

  if (alreadySent) {
    return (
      <View style={s.actionsCol}>
        <View style={s.sentPill}>
          <CheckCircle size={10} color="#16a34a" strokeWidth={2.4} />
          <Text style={s.sentPillText}>Sent</Text>
        </View>
        <Pressable
          style={({ pressed }) => [
            s.sendAgainBtn,
            pressed && !disabled && s.actionPressed,
            disabled && s.actionDisabled,
          ]}
          onPress={onSendAgain}
          disabled={disabled}
          hitSlop={4}
          accessibilityRole="button"
          accessibilityLabel="Send document again"
        >
          <RefreshCw size={10} color={CHAT_ACCENT} strokeWidth={2.3} />
          <Text style={s.sendAgainText}>Send again</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <Pressable
      style={({ pressed }) => [
        s.sendPill,
        pressed && !disabled && s.actionPressed,
        disabled && s.actionDisabled,
      ]}
      onPress={onSend}
      disabled={disabled}
      hitSlop={4}
      accessibilityRole="button"
      accessibilityLabel="Send document"
    >
      <Send size={11} color={CHAT_ACCENT} strokeWidth={2.3} />
      <Text style={s.sendPillText}>Send</Text>
    </Pressable>
  );
}

function DocRow({
  item,
  onShare,
  alreadySentPaths = [],
  sharingPath,
}: {
  item: ChatHubDocument;
  onShare: (doc: DocumentSharePayload) => void;
  alreadySentPaths?: string[];
  sharingPath: string | null;
}) {
  const uploaded = formatUploadedAt(item.uploaded_at);
  const alreadySent = pathAlreadySent(item.storage_path, alreadySentPaths);
  const isSharing =
    sharingPath != null &&
    normalizeTripDocumentsStoragePath(sharingPath) ===
      normalizeTripDocumentsStoragePath(item.storage_path);
  const actionsDisabled = sharingPath != null && !isSharing;

  const payload: DocumentSharePayload = {
    key: item.key,
    label: item.label,
    storage_path: item.storage_path,
    entity_type: item.entity_type,
    entity_id: item.entity_id,
    mime_type: item.mime_type,
    document_type: item.document_type,
  };

  const handleSend = () => {
    if (sharingPath) return;
    confirmDocumentShare(payload, false, () => onShare(payload));
  };

  const handleSendAgain = () => {
    if (sharingPath) return;
    confirmDocumentShare(payload, true, () => onShare(payload));
  };

  return (
    <View style={s.docRow}>
      <DocHubThumb item={item} />
      <View style={s.docTextCol}>
        <View style={s.docTitleRow}>
          <Text style={s.docEntity}>{item.entity_type}</Text>
          {uploaded ? (
            <Text style={s.docMeta} numberOfLines={1}>
              {uploaded}
            </Text>
          ) : null}
        </View>
        <Text style={s.docLabel} numberOfLines={2}>
          {item.label}
        </Text>
      </View>
      <DocRowActions
        alreadySent={alreadySent}
        isSharing={isSharing}
        disabled={actionsDisabled}
        onSend={handleSend}
        onSendAgain={handleSendAgain}
      />
    </View>
  );
}

export function DocumentShareSheet({
  visible,
  tripId,
  vehicleId,
  driverId,
  orgId,
  userId,
  onClose,
  onShare,
  alreadySentPaths = [],
}: DocumentShareSheetProps) {
  const [docs, setDocs] = useState<ChatHubDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [sharingPath, setSharingPath] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!visible) return;
    setLoading(true);
    try {
      const result = await listChatHubDocuments({
        tripId,
        vehicleId,
        driverId,
        orgId,
      });
      setDocs(result);
    } catch {
      setDocs([]);
    } finally {
      setLoading(false);
    }
  }, [visible, tripId, vehicleId, driverId, orgId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!visible) setSharingPath(null);
  }, [visible]);

  const handleShare = useCallback(
    (doc: DocumentSharePayload) => {
      if (sharingPath) return;
      setSharingPath(doc.storage_path);
      void Promise.resolve(onShare(doc)).finally(() => {
        setSharingPath(null);
      });
    },
    [onShare, sharingPath],
  );

  const sections = useMemo((): HubSection[] => {
    const grouped: Record<ChatHubEntityType, ChatHubDocument[]> = {
      trip: [],
      vehicle: [],
      driver: [],
    };
    for (const doc of docs) {
      grouped[doc.entity_type].push(doc);
    }
    return (["trip", "vehicle", "driver"] as ChatHubEntityType[]).map(
      (entity) => ({
        title: SECTION_META[entity].title,
        entity,
        data: grouped[entity],
      }),
    );
  }, [docs]);

  const showStructuredList = Boolean(tripId) || docs.length > 0;

  const handleUploadTripDoc = async () => {
    if (!tripId || !userId) {
      Alert.alert(
        "Cannot upload",
        "Open a trip conversation to attach trip documents.",
      );
      return;
    }
    try {
      const picked = await pickChatDocumentFile();
      if (!picked) return;
      setUploading(true);
      const { doc, error } = await uploadChatHubTripDocument({
        tripId,
        uploadedBy: userId,
        file: picked,
      });
      if (error || !doc) {
        Alert.alert("Upload failed", error?.message ?? "Could not upload file.");
        return;
      }
      await load();
      Alert.alert(
        "Document uploaded",
        "Tap Send when you are ready to share it in chat.",
      );
    } catch (e) {
      Alert.alert(
        "Upload failed",
        e instanceof Error ? e.message : "Something went wrong.",
      );
    } finally {
      setUploading(false);
    }
  };

  if (!visible) return null;

  return (
    <View style={s.overlay} pointerEvents="box-none">
      <Pressable style={s.backdrop} onPress={onClose} accessibilityRole="button" />
      <View style={s.sheet}>
        <View style={s.handle} />

        <View style={s.header}>
          <View style={s.headerTextCol}>
            <Text style={s.title}>Documents</Text>
            <Text style={s.subtitle}>Share trip, vehicle, or driver files in chat</Text>
          </View>
          <Pressable onPress={onClose} hitSlop={8} style={s.closeBtn}>
            <X size={18} color={CHAT_TEXT_MUTED} strokeWidth={2} />
          </Pressable>
        </View>

        {tripId ? (
          <Pressable
            style={({ pressed }) => [s.addRow, pressed && s.addRowPressed]}
            onPress={() => void handleUploadTripDoc()}
            disabled={uploading || sharingPath != null}
          >
            <View style={s.addIcon}>
              {uploading ? (
                <LoadingIndicator size="small" color={CHAT_ACCENT} />
              ) : (
                <Plus size={15} color={CHAT_ACCENT} strokeWidth={2.3} />
              )}
            </View>
            <View style={s.addTextCol}>
              <Text style={s.addTitle}>Add trip document</Text>
              <Text style={s.addHint}>PDF or image</Text>
            </View>
          </Pressable>
        ) : null}

        {loading ? (
          <View style={s.center}>
            <LoadingIndicator color={CHAT_ACCENT} />
          </View>
        ) : !showStructuredList ? (
          <View style={s.center}>
            <FileText size={28} color="#e2e8f0" />
            <Text style={s.emptyText}>No documents yet</Text>
            <Text style={s.emptyHint}>
              Select a trip thread to manage and share documents.
            </Text>
          </View>
        ) : (
          <SectionList
            sections={sections}
            keyExtractor={(item) => item.id}
            style={s.list}
            contentContainerStyle={s.listContent}
            stickySectionHeadersEnabled={false}
            renderSectionHeader={({ section }) => {
              const meta = SECTION_META[section.entity];
              const Icon = meta.Icon;
              return (
                <View style={s.sectionHeader}>
                  <Icon size={11} color={CHAT_TEXT_MUTED} strokeWidth={2} />
                  <Text style={s.sectionTitle}>{section.title}</Text>
                  <Text style={s.sectionCount}>{section.data.length}</Text>
                </View>
              );
            }}
            renderSectionFooter={({ section }) =>
              section.data.length === 0 ? (
                <Text style={s.sectionEmpty}>
                  {section.entity === "vehicle" && !vehicleId
                    ? "No vehicle assigned to this trip."
                    : section.entity === "driver" && !driverId
                      ? "No driver assigned to this trip."
                      : SECTION_META[section.entity].empty}
                </Text>
              ) : null
            }
            renderItem={({ item }) => (
              <DocRow
                item={item}
                onShare={handleShare}
                alreadySentPaths={alreadySentPaths}
                sharingPath={sharingPath}
              />
            )}
            ListFooterComponent={<View style={{ height: 8 }} />}
          />
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 40,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15, 23, 42, 0.35)",
  },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 8,
    paddingHorizontal: 0,
    paddingBottom: 24,
    maxHeight: "72%",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#ebebeb",
    shadowColor: "#0f172a",
    shadowOpacity: 0.1,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: -6 },
    elevation: 12,
  },
  handle: {
    width: 32,
    height: 3,
    borderRadius: 2,
    backgroundColor: "#e5e7eb",
    alignSelf: "center",
    marginBottom: 10,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 8,
    gap: 8,
    paddingHorizontal: 14,
  },
  headerTextCol: { flex: 1, minWidth: 0 },
  title: {
    fontSize: SLACK_TYPE.threadTitle,
    fontWeight: "700",
    color: "#1d1c1d",
    letterSpacing: -0.2,
  },
  subtitle: {
    fontSize: SLACK_TYPE.threadSubtitle,
    color: CHAT_TEXT_SECONDARY,
    marginTop: 2,
    lineHeight: 14,
  },
  closeBtn: { padding: 2 },
  addRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: "#ebebeb",
    backgroundColor: "#fafafa",
    marginBottom: 4,
  },
  addRowPressed: { backgroundColor: "#f4f4f4" },
  addIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: "#fff",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#e5e7eb",
    alignItems: "center",
    justifyContent: "center",
  },
  addTextCol: { flex: 1, minWidth: 0 },
  addTitle: {
    fontSize: SLACK_TYPE.listTitle,
    fontWeight: "600",
    color: "#1d1c1d",
  },
  addHint: {
    fontSize: SLACK_TYPE.listTime,
    color: CHAT_TEXT_MUTED,
    marginTop: 1,
  },
  center: {
    alignItems: "center",
    paddingVertical: 24,
    gap: 8,
    paddingHorizontal: 14,
  },
  emptyText: {
    fontSize: SLACK_TYPE.listTitle,
    color: CHAT_TEXT_SECONDARY,
    fontWeight: "600",
  },
  emptyHint: {
    fontSize: SLACK_TYPE.listPreview,
    color: CHAT_TEXT_MUTED,
    textAlign: "center",
    lineHeight: 16,
  },
  list: { flexGrow: 0 },
  listContent: { paddingBottom: 4 },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingTop: 10,
    paddingBottom: 5,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#ebebeb",
    backgroundColor: "#fafafa",
  },
  sectionTitle: {
    flex: 1,
    fontSize: SLACK_TYPE.peopleSection,
    fontWeight: "700",
    color: "#616061",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  sectionCount: {
    fontSize: SLACK_TYPE.listTime,
    fontWeight: "700",
    color: CHAT_TEXT_MUTED,
  },
  sectionEmpty: {
    fontSize: SLACK_TYPE.listPreview,
    color: CHAT_TEXT_MUTED,
    lineHeight: 15,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#f1f5f9",
  },
  docRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#f1f5f9",
    minHeight: 56,
  },
  docThumb: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: 8,
    overflow: "hidden",
    flexShrink: 0,
    backgroundColor: "#f4f4f4",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#e5e7eb",
  },
  docThumbImage: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: 8,
  },
  docThumbIcon: {
    alignItems: "center",
    justifyContent: "center",
  },
  docThumbExt: {
    position: "absolute",
    bottom: 2,
    fontSize: 6,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  docTextCol: { flex: 1, minWidth: 0, gap: 2 },
  docTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
  },
  docEntity: {
    fontSize: SLACK_TYPE.listTime,
    fontWeight: "700",
    color: CHAT_ACCENT,
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  docLabel: {
    fontSize: SLACK_TYPE.listTitle,
    fontWeight: "500",
    color: "#1d1c1d",
    lineHeight: 15,
  },
  docMeta: {
    fontSize: SLACK_TYPE.listTime,
    color: CHAT_TEXT_MUTED,
    flexShrink: 0,
  },
  actionsCol: {
    alignItems: "flex-end",
    justifyContent: "center",
    gap: 4,
    flexShrink: 0,
    minWidth: 68,
  },
  sentPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: "rgba(22, 163, 74, 0.08)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(22, 163, 74, 0.2)",
  },
  sentPillText: {
    fontSize: SLACK_TYPE.listTime,
    fontWeight: "700",
    color: "#16a34a",
  },
  sendPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: "rgba(91, 94, 244, 0.08)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(91, 94, 244, 0.18)",
  },
  sendPillText: {
    fontSize: SLACK_TYPE.listTime,
    fontWeight: "700",
    color: CHAT_ACCENT,
  },
  sendAgainBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: "#fff",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(91, 94, 244, 0.22)",
  },
  sendAgainText: {
    fontSize: SLACK_TYPE.listTime,
    fontWeight: "700",
    color: CHAT_ACCENT,
  },
  actionMeta: {
    fontSize: SLACK_TYPE.listTime,
    fontWeight: "600",
    color: CHAT_TEXT_MUTED,
  },
  actionPressed: { opacity: 0.82 },
  actionDisabled: { opacity: 0.45 },
});
