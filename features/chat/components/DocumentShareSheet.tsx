import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { FileText, X } from "lucide-react-native";
import { CHAT_ACCENT } from "@/features/chat/chatTheme";
import { getShareableDocumentsForTrip } from "../services/chat.service";

interface ShareableDoc {
  key: string;
  label: string;
  storage_path: string;
  entity_type: "vehicle" | "driver";
  entity_id: string;
}

interface DocumentShareSheetProps {
  visible: boolean;
  vehicleId: string | null;
  driverId: string | null;
  onClose: () => void;
  onShare: (doc: ShareableDoc) => void;
}

export function DocumentShareSheet({
  visible,
  vehicleId,
  driverId,
  onClose,
  onShare,
}: DocumentShareSheetProps) {
  const [docs, setDocs] = useState<ShareableDoc[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!visible) return;
    setLoading(true);
    try {
      const result = await getShareableDocumentsForTrip({ vehicleId, driverId });
      setDocs(result);
    } catch {
      setDocs([]);
    } finally {
      setLoading(false);
    }
  }, [visible, vehicleId, driverId]);

  useEffect(() => { load(); }, [load]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={s.backdrop}>
        <View style={s.sheet}>
          <View style={s.handle} />

          <View style={s.header}>
            <View>
              <Text style={s.title}>Share Document</Text>
              <Text style={s.subtitle}>Select a document to share in this chat.</Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={8} style={s.closeBtn}>
              <X size={20} color="#94a3b8" />
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={s.center}>
              <ActivityIndicator color={CHAT_ACCENT} />
            </View>
          ) : docs.length === 0 ? (
            <View style={s.center}>
              <FileText size={32} color="#e2e8f0" />
              <Text style={s.emptyText}>No documents available</Text>
              <Text style={s.emptyHint}>
                Documents must be uploaded on the vehicle or driver page first.
              </Text>
            </View>
          ) : (
            <FlatList
              data={docs}
              keyExtractor={(d) => d.key}
              contentContainerStyle={{ paddingBottom: 24 }}
              ItemSeparatorComponent={() => <View style={s.separator} />}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={s.docRow}
                  onPress={() => onShare(item)}
                  activeOpacity={0.75}
                >
                  <View style={s.docIcon}>
                    <FileText size={16} color={CHAT_ACCENT} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={s.docType}>{item.entity_type.toUpperCase()}</Text>
                    <Text style={s.docLabel} numberOfLines={1}>
                      {item.label}
                    </Text>
                  </View>
                  <Text style={s.shareHint}>Share →</Text>
                </TouchableOpacity>
              )}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 12,
    paddingHorizontal: 20,
    paddingBottom: 40,
    maxHeight: "60%",
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 40,
    shadowOffset: { width: 0, height: -10 },
    elevation: 20,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#e2e8f0",
    alignSelf: "center",
    marginBottom: 16,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: "900",
    color: "#0f172a",
    letterSpacing: -0.5,
    fontStyle: "italic",
  },
  subtitle: { fontSize: 13, color: "#94a3b8", marginTop: 3 },
  closeBtn: { padding: 4 },
  center: {
    alignItems: "center",
    paddingVertical: 32,
    gap: 10,
  },
  emptyText: { fontSize: 14, color: "#64748b", fontWeight: "600" },
  emptyHint: {
    fontSize: 12,
    color: "#94a3b8",
    textAlign: "center",
    paddingHorizontal: 20,
    lineHeight: 18,
  },
  separator: {
    height: 1,
    backgroundColor: "#f1f5f9",
    marginHorizontal: 4,
  },
  docRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 4,
  },
  docIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#e8eaf6",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  docType: {
    fontSize: 9,
    fontWeight: "800",
    color: CHAT_ACCENT,
    letterSpacing: 0.9,
    textTransform: "uppercase",
    marginBottom: 2,
  },
  docLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#0f172a",
  },
  shareHint: {
    fontSize: 11,
    fontWeight: "700",
    color: CHAT_ACCENT,
    flexShrink: 0,
  },
});
