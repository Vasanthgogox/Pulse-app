/**
 * Reconciliation summary — confirm overlay before authorize (ledger sync full page).
 * Typography matches FinanceKanbanTab transaction cards (FinanceTxnTypography).
 */
import { FinanceTxnTypography } from "@/constants/FinanceTxnTypography";
import { LedgerSyncPalette } from "@/constants/LedgerSyncPalette";
import Theme from "@/constants/Theme";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

export type LedgerReconSummaryRow = {
  label: string;
  value: string;
};

export type LedgerReconSummaryModalProps = {
  visible: boolean;
  amountText: string;
  direction: "in" | "out";
  rows: LedgerReconSummaryRow[];
  isEditMode?: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

export function LedgerReconSummaryModal({
  visible,
  amountText,
  direction,
  rows,
  isEditMode = false,
  onClose,
  onConfirm,
}: LedgerReconSummaryModalProps) {
  const amountColor =
    direction === "in" ? FinanceTxnTypography.amountIn.color : FinanceTxnTypography.amountOut.color;
  const readyPillBg =
    direction === "in" ? LedgerSyncPalette.emeraldSoft : "#FFF1F2";
  const readyPillBorder =
    direction === "in" ? "rgba(16,185,129,0.35)" : "rgba(244,63,94,0.35)";
  const readyPillTextColor =
    direction === "in" ? LedgerSyncPalette.emerald : LedgerSyncPalette.rose;

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" />
        <View style={styles.card}>
          <View style={styles.head}>
            <Text style={styles.sectionEyebrow}>Reconciliation Summary</Text>
            <View style={styles.amountRow}>
              <Text style={[styles.amountPrefix, { color: amountColor }]}>₹</Text>
              <Text
                style={[styles.amountValue, { color: amountColor }]}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {amountText}
              </Text>
              <View
                style={[
                  styles.readyPill,
                  { backgroundColor: readyPillBg, borderColor: readyPillBorder },
                ]}
              >
                <Text style={[styles.readyPillText, { color: readyPillTextColor }]}>Ready</Text>
              </View>
            </View>
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            bounces={false}
          >
            <View style={styles.detailSheet}>
              {rows.map((row, index) => (
                <View
                  key={row.label}
                  style={[
                    styles.detailRow,
                    index === rows.length - 1 && styles.detailRowLast,
                  ]}
                >
                  <Text style={styles.detailLabel} numberOfLines={2}>
                    {row.label}
                  </Text>
                  <Text style={styles.detailValue} numberOfLines={3}>
                    {row.value}
                  </Text>
                </View>
              ))}
            </View>
          </ScrollView>

          <View style={styles.actions}>
            <TouchableOpacity style={styles.btnGhost} onPress={onClose} activeOpacity={0.88}>
              <Text style={styles.btnGhostText}>Go Back</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btnPrimary, { backgroundColor: amountColor }]}
              onPress={onConfirm}
              activeOpacity={0.9}
            >
              <Text style={styles.btnPrimaryText} numberOfLines={2}>
                {isEditMode ? "Save Changes" : "Confirm Sync"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.45)",
    justifyContent: "center",
    alignItems: "center",
    padding: 12,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    maxHeight: "84%",
    flexDirection: "column",
    backgroundColor: LedgerSyncPalette.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: LedgerSyncPalette.border,
    overflow: "hidden",
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.1,
    shadowRadius: 24,
    elevation: 12,
  },
  head: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: LedgerSyncPalette.border,
    backgroundColor: LedgerSyncPalette.page,
    alignItems: "flex-start",
  },
  sectionEyebrow: {
    ...FinanceTxnTypography.columnTitle,
    marginBottom: 6,
  },
  amountRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 4,
    flexWrap: "wrap",
    width: "100%",
  },
  amountPrefix: {
    ...FinanceTxnTypography.amount,
  },
  amountValue: {
    ...FinanceTxnTypography.amount,
    flex: 1,
    minWidth: 0,
  },
  readyPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
    alignSelf: "center",
  },
  readyPillText: {
    ...FinanceTxnTypography.tripId,
    fontSize: 7,
  },
  scroll: {
    flexGrow: 1,
    flexShrink: 1,
    maxHeight: 240,
  },
  scrollContent: {
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  detailSheet: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.screenBackground,
    overflow: "hidden",
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
  },
  detailRowLast: {
    borderBottomWidth: 0,
  },
  detailLabel: {
    ...FinanceTxnTypography.fieldLabel,
    width: 104,
    flexShrink: 0,
    lineHeight: 12,
    paddingTop: 1,
  },
  detailValue: {
    ...FinanceTxnTypography.fieldValue,
    flex: 1,
    minWidth: 0,
    textAlign: "right",
  },
  actions: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: LedgerSyncPalette.border,
    backgroundColor: LedgerSyncPalette.surface,
  },
  btnGhost: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 18,
    backgroundColor: LedgerSyncPalette.surface,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
  },
  btnGhostText: {
    ...FinanceTxnTypography.buttonLabel,
    color: LedgerSyncPalette.ink,
  },
  btnPrimary: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
  },
  btnPrimaryText: {
    ...FinanceTxnTypography.buttonLabel,
    color: Theme.textOnDark,
    textAlign: "center",
    lineHeight: 13,
  },
});
