import FontAwesome from "@expo/vector-icons/FontAwesome";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

export interface DocItem {
  id: string;
  label: string;
  type: string;
  uploadedAt?: string;
  status: "Uploaded" | "Pending";
  onView?: () => void;
  onDelete?: () => void;
}

interface LRDocumentsSectionProps {
  docs?: DocItem[];
  onUpdateLR?: () => void;
  onAddDocument?: () => void;
}

export function LRDocumentsSection({
  docs = [],
  onUpdateLR,
  onAddDocument,
}: LRDocumentsSectionProps) {
  const hasDocs = docs.length > 0;
  const handleUpload = onAddDocument ?? onUpdateLR;

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <View>
          <Text style={styles.sectionTitle}>Documents</Text>
          <Text style={styles.sectionSubtitle}>LR, POD, and receipts</Text>
        </View>
        <TouchableOpacity
          style={styles.uploadBtn}
          onPress={handleUpload}
          activeOpacity={0.85}
        >
          <FontAwesome name="cloud-upload" size={12} color="#fff" />
          <Text style={styles.uploadBtnText}>Upload</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.docArea}>
        {hasDocs ? (
          <View style={styles.docList}>
            {docs.map((doc) => (
              <DocRow key={doc.id} doc={doc} />
            ))}
          </View>
        ) : (
          <DropZone onPress={handleUpload} />
        )}
      </View>
    </View>
  );
}

function DocRow({ doc }: { doc: DocItem }) {
  return (
    <View style={styles.docRow}>
      <View style={styles.docIconWrap}>
        <FontAwesome name="file-pdf-o" size={16} color="#94a3b8" />
      </View>
      <View style={styles.docInfo}>
        <Text style={styles.docLabel}>{doc.label}</Text>
        {doc.uploadedAt ? (
          <Text style={styles.docDate}>{doc.uploadedAt}</Text>
        ) : null}
      </View>
      <View
        style={[
          styles.docBadge,
          doc.status === "Uploaded" ? styles.docBadgeUploaded : styles.docBadgePending,
        ]}
      >
        <Text
          style={[
            styles.docBadgeText,
            doc.status === "Uploaded"
              ? styles.docBadgeTextUploaded
              : styles.docBadgeTextPending,
          ]}
        >
          {doc.status}
        </Text>
      </View>
      <View style={styles.docRowActions}>
        {doc.onView ? (
          <TouchableOpacity onPress={doc.onView} style={styles.docActionBtn} activeOpacity={0.7}>
            <FontAwesome name="eye" size={13} color="#6b7280" />
          </TouchableOpacity>
        ) : null}
        {doc.onDelete ? (
          <TouchableOpacity onPress={doc.onDelete} style={styles.docActionBtn} activeOpacity={0.7}>
            <FontAwesome name="trash-o" size={13} color="#ef4444" />
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

function DropZone({ onPress }: { onPress?: () => void }) {
  return (
    <TouchableOpacity
      style={styles.dropZone}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.dropZoneIcon}>
        <FontAwesome name="file-pdf-o" size={24} color="#cbd5e1" />
      </View>
      <Text style={styles.dropZoneTitle}>Drop documents here</Text>
      <Text style={styles.dropZoneSub}>or click to browse from your computer</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  section: {
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#f1f5f9",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 16,
    elevation: 2,
    flex: 1,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0f172a",
    letterSpacing: -0.2,
  },
  sectionSubtitle: {
    fontSize: 12,
    color: "#94a3b8",
    marginTop: 2,
  },
  uploadBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "#0f172a",
  },
  uploadBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#fff",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },

  // Doc list
  docArea: {
    flex: 1,
    minHeight: 160,
  },
  docList: {
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  docRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f8fafc",
  },
  docIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: "#f8fafc",
    alignItems: "center",
    justifyContent: "center",
  },
  docInfo: {
    flex: 1,
    minWidth: 0,
  },
  docLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#1e293b",
  },
  docDate: {
    fontSize: 11,
    color: "#94a3b8",
    marginTop: 2,
  },
  docBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  docBadgeUploaded: {
    backgroundColor: "#dcfce7",
  },
  docBadgePending: {
    backgroundColor: "#f1f5f9",
  },
  docBadgeText: {
    fontSize: 10,
    fontWeight: "600",
  },
  docBadgeTextUploaded: {
    color: "#15803d",
  },
  docBadgeTextPending: {
    color: "#64748b",
  },
  docRowActions: {
    flexDirection: "row",
    gap: 6,
  },
  docActionBtn: {
    padding: 4,
  },

  // Drop zone
  dropZone: {
    flex: 1,
    margin: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#e2e8f0",
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
    backgroundColor: "#f8fafc",
    gap: 8,
  },
  dropZoneIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  dropZoneTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#374151",
  },
  dropZoneSub: {
    fontSize: 12,
    color: "#94a3b8",
    textAlign: "center",
  },
});
