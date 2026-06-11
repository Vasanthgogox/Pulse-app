import React, { useCallback, useEffect, useMemo, useState } from "react";
import { LoadingIndicator } from "@/components/LoadingIndicator";
import { CHAT_ACCENT } from "@/features/chat/chatTheme";
import {
  listChatHubDocuments,
  uploadChatHubTripDocument,
  type ChatHubDocument,
  type ChatHubEntityType,
} from "@/features/chat/services/chatDocumentHub.service";
import { pickChatDocumentFile } from "@/features/chat/utils/chatDocumentPick.util";
import { documentExtensionAccent } from "@/features/chat/utils/documentShareDisplay.util";
import {
  FileText,
  Plus,
  Share2,
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
  onShare: (doc: DocumentSharePayload) => void;
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

function DocRow({
  item,
  onShare,
}: {
  item: ChatHubDocument;
  onShare: (doc: DocumentSharePayload) => void;
}) {
  const ext =
    item.label.split(".").pop()?.toUpperCase().slice(0, 4) ||
    (item.document_type ?? "DOC").slice(0, 4).toUpperCase();
  const accent = documentExtensionAccent(ext);
  const uploaded = formatUploadedAt(item.uploaded_at);

  return (
    <Pressable
      style={s.docRow}
      onPress={() =>
        onShare({
          key: item.key,
          label: item.label,
          storage_path: item.storage_path,
          entity_type: item.entity_type,
          entity_id: item.entity_id,
          mime_type: item.mime_type,
          document_type: item.document_type,
        })
      }
    >
      <View style={[s.docIcon, { backgroundColor: `${accent}18` }]}>
        <FileText size={16} color={accent} strokeWidth={2.2} />
      </View>
      <View style={s.docTextCol}>
        <Text style={s.docEntity}>{item.entity_type.toUpperCase()}</Text>
        <Text style={s.docLabel} numberOfLines={2}>
          {item.label}
        </Text>
        {uploaded ? (
          <Text style={s.docMeta} numberOfLines={1}>
            Uploaded {uploaded}
          </Text>
        ) : null}
      </View>
      <View style={s.shareBtn}>
        <Share2 size={13} color={CHAT_ACCENT} strokeWidth={2.4} />
        <Text style={s.shareHint}>Share</Text>
      </View>
    </Pressable>
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
}: DocumentShareSheetProps) {
  const [docs, setDocs] = useState<ChatHubDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

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
      onShare({
        key: doc.key,
        label: doc.label,
        storage_path: doc.storage_path,
        entity_type: doc.entity_type,
        entity_id: doc.entity_id,
        mime_type: doc.mime_type,
        document_type: doc.document_type,
      });
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
            <Text style={s.subtitle}>
              Trip, vehicle, and driver files — upload or share in chat.
            </Text>
          </View>
          <Pressable onPress={onClose} hitSlop={8} style={s.closeBtn}>
            <X size={20} color="#94a3b8" />
          </Pressable>
        </View>

        {tripId ? (
          <Pressable
            style={({ pressed }) => [s.addRow, pressed && s.addRowPressed]}
            onPress={() => void handleUploadTripDoc()}
            disabled={uploading}
          >
            <View style={s.addIcon}>
              {uploading ? (
                <LoadingIndicator size="small" color={CHAT_ACCENT} />
              ) : (
                <Plus size={18} color={CHAT_ACCENT} strokeWidth={2.4} />
              )}
            </View>
            <View style={s.addTextCol}>
              <Text style={s.addTitle}>Add trip document</Text>
              <Text style={s.addHint}>PDF or image — shares to this chat</Text>
            </View>
          </Pressable>
        ) : null}

        {loading ? (
          <View style={s.center}>
            <LoadingIndicator color={CHAT_ACCENT} />
          </View>
        ) : !showStructuredList ? (
          <View style={s.center}>
            <FileText size={32} color="#e2e8f0" />
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
                  <Icon size={13} color="#64748b" strokeWidth={2.2} />
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
              ) : (
                <View style={s.sectionGap} />
              )
            }
            renderItem={({ item }) => <DocRow item={item} onShare={onShare} />}
            ListFooterComponent={<View style={{ height: 12 }} />}
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
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 10,
    paddingHorizontal: 16,
    paddingBottom: 28,
    maxHeight: "72%",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#e2e8f0",
    shadowColor: "#0f172a",
    shadowOpacity: 0.14,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -8 },
    elevation: 16,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#e2e8f0",
    alignSelf: "center",
    marginBottom: 12,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
    gap: 10,
  },
  headerTextCol: { flex: 1, minWidth: 0 },
  title: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0f172a",
    letterSpacing: -0.3,
  },
  subtitle: { fontSize: 12, color: "#64748b", marginTop: 3, lineHeight: 16 },
  closeBtn: { padding: 4 },
  addRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: "rgba(91, 94, 244, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(91, 94, 244, 0.2)",
    marginBottom: 12,
  },
  addRowPressed: { opacity: 0.88 },
  addIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  addTextCol: { flex: 1, minWidth: 0 },
  addTitle: { fontSize: 14, fontWeight: "700", color: "#0f172a" },
  addHint: { fontSize: 11, color: "#64748b", marginTop: 2 },
  center: {
    alignItems: "center",
    paddingVertical: 28,
    gap: 10,
    paddingHorizontal: 12,
  },
  emptyText: { fontSize: 14, color: "#64748b", fontWeight: "600" },
  emptyHint: {
    fontSize: 12,
    color: "#94a3b8",
    textAlign: "center",
    lineHeight: 18,
  },
  list: { flexGrow: 0 },
  listContent: { paddingBottom: 8 },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingTop: 8,
    paddingBottom: 6,
  },
  sectionTitle: {
    flex: 1,
    fontSize: 11,
    fontWeight: "800",
    color: "#475569",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  sectionCount: {
    fontSize: 10,
    fontWeight: "700",
    color: "#94a3b8",
  },
  sectionEmpty: {
    fontSize: 11,
    color: "#94a3b8",
    lineHeight: 16,
    paddingBottom: 8,
    paddingLeft: 2,
  },
  sectionGap: { height: 4 },
  docRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#f1f5f9",
  },
  docIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  docTextCol: { flex: 1, minWidth: 0, gap: 1 },
  docEntity: {
    fontSize: 9,
    fontWeight: "800",
    color: CHAT_ACCENT,
    letterSpacing: 0.7,
  },
  docLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#0f172a",
    lineHeight: 17,
  },
  docMeta: {
    fontSize: 10,
    color: "#94a3b8",
    marginTop: 1,
  },
  shareBtn: {
    alignItems: "center",
    gap: 2,
    flexShrink: 0,
    paddingLeft: 4,
  },
  shareHint: {
    fontSize: 9,
    fontWeight: "700",
    color: CHAT_ACCENT,
  },
});
