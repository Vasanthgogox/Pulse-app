/**
 * The focused Compliance review experience — opened from a trip card's
 * "Review Documents" button or the table's "Review" action. Two steps in one
 * Modal: a document list, then (after selecting a document) a preview pane
 * with Approve/Reject. Self-contained: calls the same
 * verify/reject/upload/mark-verified services ComplianceSection already
 * uses — no new persistence, no new document store.
 *
 * Preview reuses the app's existing convention (Linking.openURL against a
 * signed URL from getDocumentViewUrl) rather than embedding a new in-app
 * viewer — this app has no embedded document viewer anywhere to reuse, and
 * building one would be exactly the kind of "invent another viewer" this
 * pass was told not to do.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { X, ChevronLeft } from "lucide-react-native";
import Theme from "@/constants/Theme";
import { getDocumentViewUrl, uploadTripDocument, type TripDocumentType } from "@/features/trips/services/tripDocuments.service";
import { alertMessage } from "@/features/tripCompliance/utils/crossPlatformAlert.util";
import { setTripDocumentVerification } from "@/features/tripCompliance/services/tripComplianceWrite.service";
import type { ComplianceDocumentRow } from "@/features/tripCompliance/tripCompliance.types";
import {
  deriveComplianceDocumentRows,
  labelForDocType,
  type ComplianceDocRow,
} from "@/features/tripCompliance/utils/complianceDocumentRows.util";
import { ComplianceStatusChip, COMPLIANCE_STATUS_META } from "@/features/tripCompliance/components/ComplianceStatusIcon";
import { ComplianceInputModal } from "@/features/tripCompliance/components/ComplianceInputModal";

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
  } catch {
    return "—";
  }
}

export type ComplianceDocumentReviewSheetProps = {
  visible: boolean;
  onClose: () => void;
  tripId: string;
  tripLabel: string; // e.g. "TRP051 · Apple"
  organizationId: string;
  actorId: string | null;
  documents: ComplianceDocumentRow[];
  canVerify: boolean;
  /** Open straight into a document's preview (e.g. from a table row's inline action) instead of the list step. */
  initialSelectedKey?: string | null;
  /** Refetch the underlying list/detail data after any write. */
  onChanged: () => void;
};

export function ComplianceDocumentReviewSheet({
  visible,
  onClose,
  tripId,
  tripLabel,
  organizationId,
  actorId,
  documents,
  canVerify,
  initialSelectedKey = null,
  onChanged,
}: ComplianceDocumentReviewSheetProps) {
  const rows = useMemo(() => deriveComplianceDocumentRows(documents), [documents]);
  const [selectedKey, setSelectedKey] = useState<string | null>(initialSelectedKey);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [rejectVisible, setRejectVisible] = useState(false);
  const [uploadingMissing, setUploadingMissing] = useState(false);

  const selected: ComplianceDocRow | null = rows.find((r) => r.key === selectedKey) ?? null;

  useEffect(() => {
    if (visible) {
      setSelectedKey(initialSelectedKey);
    } else {
      setPreviewUrl(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, tripId]);

  useEffect(() => {
    let cancelled = false;
    if (selected?.doc) {
      getDocumentViewUrl(selected.doc.storage_path).then((url) => {
        if (!cancelled) setPreviewUrl(url);
      });
    } else {
      setPreviewUrl(null);
    }
    return () => {
      cancelled = true;
    };
  }, [selected?.doc?.storage_path]);

  const handleOpenDocument = useCallback(() => {
    if (previewUrl) void Linking.openURL(previewUrl);
  }, [previewUrl]);

  const handleApprove = useCallback(async () => {
    if (!selected?.doc || !actorId) return;
    setBusy(true);
    const { error } = await setTripDocumentVerification({
      document: selected.doc,
      organizationId,
      actorId,
      status: "verified",
    });
    setBusy(false);
    if (error) {
      alertMessage("Couldn't approve document", error.message);
      return;
    }
    onChanged();
  }, [selected, actorId, organizationId, onChanged]);

  const handleRejectSubmit = useCallback(
    async (values: Record<string, string>) => {
      if (!selected?.doc || !actorId) return;
      setBusy(true);
      const { error } = await setTripDocumentVerification({
        document: selected.doc,
        organizationId,
        actorId,
        status: "rejected",
        rejectionReason: values.reason,
      });
      setBusy(false);
      setRejectVisible(false);
      if (error) {
        alertMessage("Couldn't reject document", error.message);
        return;
      }
      onChanged();
    },
    [selected, actorId, organizationId, onChanged],
  );

  const handleAddMissing = useCallback(
    async (type: string) => {
      if (!actorId) return;
      setUploadingMissing(true);
      try {
        const res = await DocumentPicker.getDocumentAsync({ type: ["application/pdf", "image/*"], copyToCacheDirectory: true });
        if (res.canceled || !res.assets[0]) return;
        const asset = res.assets[0];
        const arrayBuffer = await fetch(asset.uri).then((r) => r.arrayBuffer());
        const { error } = await uploadTripDocument(
          tripId,
          actorId,
          { arrayBuffer, fileName: asset.name ?? `${type}.pdf`, mimeType: asset.mimeType ?? "application/pdf" },
          type as TripDocumentType,
        );
        if (error) throw error;
        onChanged();
      } catch (e) {
        alertMessage("Couldn't add document", (e as Error).message);
      } finally {
        setUploadingMissing(false);
      }
    },
    [tripId, actorId, onChanged],
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.header}>
            {selected ? (
              <TouchableOpacity style={styles.backBtn} onPress={() => setSelectedKey(null)}>
                <ChevronLeft size={16} color={Theme.textPrimary} strokeWidth={2.2} />
                <Text style={styles.backBtnText}>Back to documents</Text>
              </TouchableOpacity>
            ) : (
              <View>
                <Text style={styles.headerTitle}>Compliance Review</Text>
                <Text style={styles.headerSubtitle}>{tripLabel}</Text>
              </View>
            )}
            <TouchableOpacity onPress={onClose} accessibilityLabel="Close">
              <X size={18} color={Theme.textMuted} strokeWidth={2} />
            </TouchableOpacity>
          </View>

          {!selected ? (
            <ScrollView style={styles.listScroll}>
              <Text style={styles.sectionLabel}>DOCUMENTS</Text>
              {rows.map((row) => {
                const meta = COMPLIANCE_STATUS_META[row.status];
                return (
                  <TouchableOpacity
                    key={row.key}
                    style={styles.docRow}
                    disabled={row.status === "missing"}
                    onPress={() => setSelectedKey(row.key)}
                  >
                    <Text style={styles.docRowLabel}>{labelForDocType(row.type)}</Text>
                    <ComplianceStatusChip status={row.status} label={meta.label} compact />
                    {row.status === "missing" && canVerify ? (
                      <TouchableOpacity
                        disabled={uploadingMissing}
                        onPress={() => handleAddMissing(row.type)}
                        style={styles.addBtn}
                      >
                        <Text style={styles.addBtnText}>{uploadingMissing ? "…" : "Add"}</Text>
                      </TouchableOpacity>
                    ) : null}
                  </TouchableOpacity>
                );
              })}
              <Text style={styles.hint}>Select a document to review</Text>
            </ScrollView>
          ) : (
            <ScrollView style={styles.previewScroll}>
              <View style={styles.previewBox}>
                <Text style={styles.previewBoxLabel}>DOCUMENT PREVIEW</Text>
                {previewUrl ? (
                  <TouchableOpacity onPress={handleOpenDocument} style={styles.openDocBtn}>
                    <Text style={styles.openDocBtnText}>Open Document</Text>
                  </TouchableOpacity>
                ) : (
                  <ActivityIndicator size="small" color={Theme.textMuted} />
                )}
              </View>
              <Text style={styles.docTitle}>{labelForDocType(selected.type)}</Text>
              <Text style={styles.docMeta}>
                {selected.doc ? `Uploaded ${formatDate(selected.doc.uploaded_at)}` : ""} · {COMPLIANCE_STATUS_META[selected.status].label}
                {selected.status === "verified" && selected.doc?.verified_at ? ` ${formatDate(selected.doc.verified_at)}` : ""}
              </Text>
              {selected.status === "rejected" && selected.doc?.rejection_reason ? (
                <Text style={styles.rejectReasonText}>Reason: {selected.doc.rejection_reason}</Text>
              ) : null}

              {canVerify ? (
                <View style={styles.actionsRow}>
                  {busy ? (
                    <ActivityIndicator size="small" color={Theme.textMuted} />
                  ) : (
                    <>
                      {selected.status !== "verified" ? (
                        <TouchableOpacity style={styles.approveBtn} onPress={handleApprove}>
                          <Text style={styles.approveBtnText}>✓ Approve</Text>
                        </TouchableOpacity>
                      ) : null}
                      {selected.status !== "rejected" ? (
                        <TouchableOpacity style={styles.rejectBtn} onPress={() => setRejectVisible(true)}>
                          <Text style={styles.rejectBtnText}>Reject</Text>
                        </TouchableOpacity>
                      ) : null}
                    </>
                  )}
                </View>
              ) : null}
            </ScrollView>
          )}
        </View>
      </View>

      <ComplianceInputModal
        visible={rejectVisible}
        title="Reject document"
        fields={[{ key: "reason", label: "Why is this document being rejected?", placeholder: "Enter reason", required: true }]}
        confirmLabel="Reject Document"
        onCancel={() => setRejectVisible(false)}
        onSubmit={handleRejectSubmit}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(15,23,42,0.45)", alignItems: "center", justifyContent: "center", padding: 16 },
  sheet: { width: "100%", maxWidth: 480, maxHeight: "80%", backgroundColor: "#FFFFFF", borderRadius: 16, overflow: "hidden" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F2F6",
  },
  headerTitle: { fontSize: 15, fontWeight: "700", color: Theme.textPrimary },
  headerSubtitle: { fontSize: 12, color: Theme.textMuted, marginTop: 2 },
  backBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  backBtnText: { fontSize: 13, fontWeight: "600", color: Theme.textPrimary },
  listScroll: { padding: 16 },
  sectionLabel: { fontSize: 10, fontWeight: "700", color: Theme.textMuted, letterSpacing: 0.5, marginBottom: 8 },
  docRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: "#F1F2F6",
  },
  docRowLabel: { flex: 1, fontSize: 13, fontWeight: "600", color: Theme.textPrimary },
  addBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, backgroundColor: "#111827" },
  addBtnText: { fontSize: 11, fontWeight: "700", color: "#FFFFFF" },
  hint: { fontSize: 12, color: Theme.textMuted, textAlign: "center", marginTop: 16 },
  previewScroll: { padding: 16 },
  previewBox: {
    backgroundColor: "#F8F9FB",
    borderRadius: 12,
    padding: 24,
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
  },
  previewBoxLabel: { fontSize: 10, fontWeight: "700", color: Theme.textMuted, letterSpacing: 0.5 },
  openDocBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: "#111827" },
  openDocBtnText: { fontSize: 12, fontWeight: "700", color: "#FFFFFF" },
  docTitle: { fontSize: 15, fontWeight: "700", color: Theme.textPrimary },
  docMeta: { fontSize: 12, color: Theme.textMuted, marginTop: 2 },
  rejectReasonText: { fontSize: 12, color: Theme.teslaRed, marginTop: 6 },
  actionsRow: { flexDirection: "row", gap: 10, marginTop: 16 },
  approveBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: Theme.success, alignItems: "center" },
  approveBtnText: { fontSize: 13, fontWeight: "700", color: "#FFFFFF" },
  rejectBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: "#FDEBEC",
    alignItems: "center",
  },
  rejectBtnText: { fontSize: 13, fontWeight: "700", color: Theme.teslaRed },
});
