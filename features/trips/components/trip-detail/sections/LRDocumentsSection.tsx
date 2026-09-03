/**
 * LR & Documents section — matches reference design.
 * Update LR + Add Document buttons, uploaded doc list, empty state.
 */
import Theme from "@/constants/Theme";
import { VAULT_DOC_LIMIT_HINT } from "@/features/trips/components/trip-detail/tripDocTypes";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

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
  /** `gallery` — horizontal document cards (reference trip detail UI). */
  presentation?: "list" | "gallery";
}

export function LRDocumentsSection({
  docs = [],
  onUpdateLR,
  onAddDocument,
  presentation = "list",
}: LRDocumentsSectionProps) {
  const hasDocs = docs.length > 0;
  const isGallery = presentation === "gallery";
  const galleryDistributeRow =
    isGallery && Platform.OS === "web" && hasDocs && docs.length <= 6;

  return (
    <View style={styles.section}>
      {isGallery ? (
        <View>
          <View style={styles.galleryHeader}>
            <View style={styles.galleryHeaderLeft}>
              <FontAwesome name="paperclip" size={14} color="#9ca3af" />
              <Text style={styles.galleryHeaderTitle}>DOCUMENTS</Text>
            </View>
            <View style={styles.sectionActions}>
              <TouchableOpacity
                style={styles.galleryIconBtn}
                onPress={onUpdateLR}
                activeOpacity={0.85}
              >
                <FontAwesome name="pencil" size={12} color="#64748b" />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.galleryIconBtn}
                onPress={onAddDocument}
                activeOpacity={0.85}
              >
                <FontAwesome name="plus" size={12} color="#64748b" />
              </TouchableOpacity>
            </View>
          </View>
          <Text style={styles.limitsHint}>{VAULT_DOC_LIMIT_HINT}</Text>
        </View>
      ) : (
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>LR & Documents</Text>
          <View style={styles.sectionActions}>
            <TouchableOpacity
              style={styles.actionBtnPrimary}
              onPress={onUpdateLR}
              activeOpacity={0.85}
            >
              <FontAwesome name="plus" size={11} color="#fff" />
              <Text style={styles.actionBtnPrimaryText}>UPDATE LR</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionBtnSecondary}
              onPress={onAddDocument}
              activeOpacity={0.85}
            >
              <FontAwesome name="plus" size={11} color="#fff" />
              <Text style={styles.actionBtnSecondaryText}>Add Document</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <View style={styles.docArea}>
        {hasDocs ? (
          isGallery ? (
            galleryDistributeRow ? (
              <View style={styles.galleryRow}>
                {docs.map((doc) => (
                  <GalleryDocCard key={doc.id} doc={doc} rowLayout />
                ))}
              </View>
            ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.galleryScroll}
              >
                {docs.map((doc) => (
                  <GalleryDocCard key={doc.id} doc={doc} />
                ))}
              </ScrollView>
            )
          ) : (
            <View style={styles.docList}>
              {docs.map((doc) => (
                <DocRow key={doc.id} doc={doc} />
              ))}
            </View>
          )
        ) : (
          <EmptyDocs />
        )}
      </View>
    </View>
  );
}

function GalleryDocCard({ doc, rowLayout }: { doc: DocItem; rowLayout?: boolean }) {
  const uploaded = doc.status === "Uploaded";
  const body = (
    <View style={styles.galleryCardContent}>
      <FontAwesome name="file-text-o" size={22} color="#9ca3af" />
      <Text style={styles.galleryCardTitle} numberOfLines={2}>
        {doc.label.toUpperCase()}
      </Text>
      <Text style={styles.galleryCardType}>{doc.type || "FILE"}</Text>
      <View style={styles.galleryCardSpacer} />
      <View
        style={[
          styles.galleryStatusDot,
          uploaded ? styles.galleryStatusDotOn : styles.galleryStatusDotOff,
        ]}
      />
    </View>
  );
  const cardStyle = [styles.galleryCard, rowLayout && styles.galleryCardRow];
  if (doc.onView) {
    return (
      <TouchableOpacity style={cardStyle} onPress={doc.onView} activeOpacity={0.85}>
        {body}
      </TouchableOpacity>
    );
  }
  return <View style={cardStyle}>{body}</View>;
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
  galleryHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  galleryHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  galleryHeaderTitle: {
    fontSize: 11,
    fontWeight: "800",
    color: "#6b7280",
    letterSpacing: 0.8,
  },
  limitsHint: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    fontSize: 11,
    fontWeight: "500",
    color: "#9ca3af",
    lineHeight: 16,
  },
  galleryIconBtn: {
    width: 34,
    height: 34,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "#f9fafb",
    alignItems: "center",
    justifyContent: "center",
  },
  galleryScroll: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 12,
  },
  galleryRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 12,
    justifyContent: "space-between",
    width: "100%",
  },
  galleryCard: {
    width: 132,
    minHeight: 148,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: Theme.screenBackground,
    paddingVertical: 14,
    paddingHorizontal: 10,
    marginRight: 12,
  },
  galleryCardRow: {
    flexGrow: 1,
    flexBasis: 0,
    minWidth: 140,
    maxWidth: 400,
    marginRight: 0,
    width: undefined,
  },
  galleryCardContent: {
    width: "100%",
    minHeight: 120,
    alignItems: "center",
  },
  galleryCardSpacer: {
    flexGrow: 1,
    minHeight: 8,
  },
  galleryCardTitle: {
    fontSize: 10,
    fontWeight: "800",
    color: "#111827",
    textAlign: "center",
    letterSpacing: 0.2,
    lineHeight: 14,
  },
  galleryCardType: {
    fontSize: 10,
    fontWeight: "600",
    color: "#9ca3af",
    textTransform: "uppercase",
  },
  galleryStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: "auto",
  },
  galleryStatusDotOn: {
    backgroundColor: "#22c55e",
  },
  galleryStatusDotOff: {
    backgroundColor: "#d1d5db",
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
