import Feather from "@expo/vector-icons/Feather";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import Theme from "@/constants/Theme";
import type { TripCostEvent } from "@/features/finance";
import { getDocumentViewUrl } from "@/features/trips/services/tripDocuments.service";

import {
  loadExpensePreviewDetail,
  type ExpensePreviewDetail,
} from "../shared/expensePreview.util";

type Props = {
  visible: boolean;
  costEventId: string | null;
  event?: TripCostEvent | null;
  isDriverViewer?: boolean;
  onClose: () => void;
  onEdit?: (event: TripCostEvent) => void;
  onRemind?: (event: TripCostEvent) => void;
  onCancel?: (event: TripCostEvent) => void;
  statusLabel?: string;
};

function inr(value: number): string {
  return `₹${Math.round(value).toLocaleString("en-IN")}`;
}

export function ExpensePreviewSheet({
  visible,
  costEventId,
  event,
  isDriverViewer = false,
  onClose,
  onEdit,
  onRemind,
  onCancel,
  statusLabel,
}: Props) {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<ExpensePreviewDetail | null>(null);
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [receiptLoading, setReceiptLoading] = useState(false);
  const [receiptFullscreen, setReceiptFullscreen] = useState(false);

  useEffect(() => {
    if (!visible || !costEventId) {
      setDetail(null);
      setError(null);
      setReceiptUrl(null);
      setReceiptFullscreen(false);
      return;
    }
    let mounted = true;
    setLoading(true);
    setError(null);
    setReceiptUrl(null);
    void loadExpensePreviewDetail(costEventId, event).then((res) => {
      if (!mounted) return;
      setLoading(false);
      if (res.error || !res.detail) {
        setError(res.error?.message ?? "Could not load expense");
        setDetail(null);
        return;
      }
      setDetail(res.detail);
      const path = res.detail.receiptStoragePath?.trim();
      if (!path) return;
      setReceiptLoading(true);
      void getDocumentViewUrl(path).then((url) => {
        if (!mounted) return;
        setReceiptUrl(url || null);
        setReceiptLoading(false);
      });
    });
    return () => {
      mounted = false;
    };
  }, [costEventId, event, visible]);

  const handleEdit = useCallback(() => {
    if (!event || !onEdit) return;
    onClose();
    onEdit(event);
  }, [event, onClose, onEdit]);

  const showDriverActions =
    isDriverViewer &&
    event &&
    event.approvalState === "pending" &&
    event.postingState !== "posted";

  return (
    <>
      <Modal
        visible={visible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={onClose}
      >
        <View style={[styles.root, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 12 }]}>
          <View style={styles.header}>
            <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close">
              <Text style={styles.closeText}>Close</Text>
            </Pressable>
            <Text style={styles.headerTitle}>Expense</Text>
            <View style={styles.headerSpacer} />
          </View>

          {loading ? (
            <View style={styles.center}>
              <ActivityIndicator color={Theme.primary} />
              <Text style={styles.loadingText}>Loading expense…</Text>
            </View>
          ) : error ? (
            <View style={styles.center}>
              <Feather name="alert-circle" size={28} color={Theme.destructive} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : detail ? (
            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.hero}>
                <Text style={styles.category}>{detail.categoryLabel}</Text>
                <Text style={styles.amount}>{inr(detail.amountInr)}</Text>
                {statusLabel ? (
                  <View style={styles.statusPill}>
                    <Text style={styles.statusPillText}>{statusLabel}</Text>
                  </View>
                ) : null}
                <Text style={styles.date}>
                  {new Date(detail.enteredAt).toLocaleDateString("en-IN", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </Text>
              </View>

              <View style={styles.card}>
                {detail.detailLines.map((line) => (
                  <View key={line.label} style={styles.metaRow}>
                    <Text style={styles.metaLabel}>{line.label}</Text>
                    <Text style={styles.metaValue}>{line.value}</Text>
                  </View>
                ))}
                {detail.notes ? (
                  <View style={styles.notesBlock}>
                    <Text style={styles.metaLabel}>Notes</Text>
                    <Text style={styles.notesText}>{detail.notes}</Text>
                  </View>
                ) : null}
              </View>

              <View style={styles.card}>
                <Text style={styles.receiptTitle}>Receipt</Text>
                {receiptLoading ? (
                  <ActivityIndicator color={Theme.primary} style={styles.receiptLoader} />
                ) : receiptUrl ? (
                  <Pressable
                    onPress={() => setReceiptFullscreen(true)}
                    accessibilityRole="button"
                    accessibilityLabel="View receipt full screen"
                  >
                    <Image source={{ uri: receiptUrl }} style={styles.receiptImage} resizeMode="cover" />
                    <Text style={styles.receiptHint}>Tap to enlarge</Text>
                  </Pressable>
                ) : detail.receiptStoragePath ? (
                  <Text style={styles.receiptMissing}>Receipt uploaded — preview unavailable</Text>
                ) : (
                  <Text style={styles.receiptMissing}>No receipt attached</Text>
                )}
              </View>

              {detail.canEdit && onEdit && event ? (
                <Pressable style={styles.editBtn} onPress={handleEdit}>
                  <Feather name="edit-2" size={14} color={Theme.primary} />
                  <Text style={styles.editBtnText}>Edit expense</Text>
                </Pressable>
              ) : null}

              {showDriverActions ? (
                <View style={styles.driverActions}>
                  <Pressable
                    style={[styles.actionBtn, styles.actionPrimary]}
                    onPress={() => event && onRemind?.(event)}
                  >
                    <Text style={styles.actionPrimaryText}>Remind fleet</Text>
                  </Pressable>
                  <Pressable
                    style={styles.actionBtn}
                    onPress={() => event && onCancel?.(event)}
                  >
                    <Text style={styles.actionSecondaryText}>Cancel request</Text>
                  </Pressable>
                </View>
              ) : null}
            </ScrollView>
          ) : null}
        </View>
      </Modal>

      <Modal
        visible={receiptFullscreen && !!receiptUrl}
        animationType="fade"
        transparent
        onRequestClose={() => setReceiptFullscreen(false)}
      >
        <Pressable style={styles.fullscreenBackdrop} onPress={() => setReceiptFullscreen(false)}>
          {receiptUrl ? (
            <Image source={{ uri: receiptUrl }} style={styles.fullscreenImage} resizeMode="contain" />
          ) : null}
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Theme.screenBackground,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
  },
  closeText: {
    fontSize: 14,
    fontWeight: "700",
    color: Theme.primary,
    minWidth: 52,
  },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: 15,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
  },
  headerSpacer: {
    minWidth: 52,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: 24,
  },
  loadingText: {
    fontSize: 13,
    color: Theme.textSecondary,
  },
  errorText: {
    fontSize: 13,
    color: Theme.destructive,
    textAlign: "center",
    lineHeight: 18,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    gap: 12,
  },
  hero: {
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
  },
  category: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: Theme.textMuted,
  },
  amount: {
    fontSize: 32,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    fontVariant: ["tabular-nums"],
  },
  statusPill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusPillText: {
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    color: Theme.textSecondary,
  },
  date: {
    fontSize: 11,
    fontWeight: "500",
    color: Theme.textMuted,
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
    padding: 12,
    gap: 10,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  metaLabel: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: Theme.textMuted,
    flexShrink: 0,
  },
  metaValue: {
    flex: 1,
    textAlign: "right",
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
  },
  notesBlock: {
    gap: 6,
    paddingTop: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderLight,
  },
  notesText: {
    fontSize: 12,
    lineHeight: 17,
    color: Theme.textPrimaryDark,
  },
  receiptTitle: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: Theme.textMuted,
  },
  receiptLoader: {
    marginVertical: 20,
  },
  receiptImage: {
    width: "100%",
    height: 220,
    borderRadius: 10,
    backgroundColor: Theme.surface,
  },
  receiptHint: {
    marginTop: 6,
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textSecondary,
    textAlign: "center",
  },
  receiptMissing: {
    fontSize: 12,
    color: Theme.textMuted,
    fontStyle: "italic",
  },
  editBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    alignSelf: "center",
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  editBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.primary,
  },
  driverActions: {
    gap: 8,
    marginTop: 4,
  },
  actionBtn: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
    paddingVertical: 12,
    alignItems: "center",
  },
  actionPrimary: {
    backgroundColor: Theme.primary,
    borderColor: Theme.primary,
  },
  actionPrimaryText: {
    fontSize: 13,
    fontWeight: "800",
    color: Theme.textOnPrimary,
  },
  actionSecondaryText: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  fullscreenBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.92)",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  fullscreenImage: {
    width: "100%",
    height: "100%",
  },
});
