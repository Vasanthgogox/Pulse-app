/**
 * LR & Documents section — matches reference design.
 * Update LR + Add Document buttons, uploaded doc list, empty state.
 */
import Theme from "@/constants/Theme";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from "react-native";

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
  const { width } = useWindowDimensions();
  const isMobile = width < 640;

  return (
    <View style={styles.section}>
      <View style={[styles.sectionHeader, isMobile && styles.sectionHeaderMobile]}>
        <Text style={styles.sectionTitle}>LR & Documents</Text>
        <View style={[styles.sectionActions, isMobile && styles.sectionActionsMobile]}>
          <TouchableOpacity
            style={[styles.actionBtnPrimary, isMobile && styles.actionBtnFlex]}
            onPress={onUpdateLR}
            activeOpacity={0.85}
          >
            <FontAwesome name="plus" size={11} color="#fff" />
            <Text style={styles.actionBtnPrimaryText} numberOfLines={1}>Update LR</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtnSecondary, isMobile && styles.actionBtnFlex]}
            onPress={onAddDocument}
            activeOpacity={0.85}
          >
            <FontAwesome name="plus" size={11} color="#fff" />
            <Text style={styles.actionBtnSecondaryText} numberOfLines={1}>Add Doc</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.docArea}>
        {hasDocs ? (
          <View style={styles.docList}>
            {docs.map((doc) => (
              <DocRow key={doc.id} doc={doc} />
            ))}
          </View>
        ) : (
          <EmptyDocs />
        )}
      </View>
    </View>
  );
}

function DocRow({ doc }: { doc: DocItem }) {
  const canOpen = !!doc.onView;
  return (
    <TouchableOpacity
      style={styles.docRow}
      onPress={doc.onView}
      disabled={!canOpen}
      activeOpacity={canOpen ? 0.75 : 1}
    >
      <View style={styles.docIconWrap}>
        <FontAwesome name="file-text-o" size={18} color="#9ca3af" />
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
          <TouchableOpacity
            onPress={doc.onView}
            style={styles.docActionBtn}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <FontAwesome name="eye" size={14} color="#6b7280" />
          </TouchableOpacity>
        ) : null}
        {doc.onDelete ? (
          <TouchableOpacity onPress={doc.onDelete} style={styles.docActionBtn} activeOpacity={0.7}>
            <FontAwesome name="trash-o" size={14} color="#ef4444" />
          </TouchableOpacity>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

function EmptyDocs() {
  return (
    <View style={styles.emptyWrap}>
      <FontAwesome name="file-o" style={styles.emptyIcon} color="#d1d5db" />
      <Text style={styles.emptyTitle}>No documents uploaded</Text>
      <Text style={styles.emptySubtitle}>Upload LR/POD documents for this trip</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    backgroundColor: Theme.screenBackground,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    overflow: "hidden",
    marginBottom: 12,
    width: '100%',
    alignSelf: 'stretch',
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  sectionHeaderMobile: {
    flexDirection: "column",
    alignItems: "stretch",
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
  },
  sectionActions: {
    flexDirection: "row",
    gap: 8,
    minWidth: 0,
    flexShrink: 1,
  },
  sectionActionsMobile: {
    width: "100%",
  },
  actionBtnFlex: {
    flex: 1,
    justifyContent: "center",
  },
  actionBtnPrimary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: "#111827",
  },
  actionBtnPrimaryText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#fff",
  },
  actionBtnSecondary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: "#374151",
  },
  actionBtnSecondaryText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#fff",
  },
  docArea: {
    minHeight: 120,
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
    borderBottomColor: "#f9fafb",
  },
  docIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: "#f3f4f6",
    alignItems: "center",
    justifyContent: "center",
  },
  docInfo: {
    flex: 1,
    minWidth: 0,
  },
  docLabel: {
    fontSize: 13,
    fontWeight: "500",
    color: "#111827",
  },
  docDate: {
    fontSize: 11,
    color: "#9ca3af",
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
    backgroundColor: "#f3f4f6",
  },
  docBadgeText: {
    fontSize: 10,
    fontWeight: "600",
  },
  docBadgeTextUploaded: {
    color: "#15803d",
  },
  docBadgeTextPending: {
    color: "#6b7280",
  },
  docRowActions: {
    flexDirection: "row",
    gap: 8,
  },
  docActionBtn: {
    padding: 4,
  },
  emptyWrap: {
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 40,
    textAlign: "center",
    width: "100%",
    minHeight: 250,
  },
  emptyIcon: {
    fontSize: 40,
    opacity: 0.4,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#374151",
  },
  emptySubtitle: {
    fontSize: 13,
    color: "#9ca3af",
    maxWidth: 300,
  },
});
