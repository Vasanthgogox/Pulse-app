/**
 * Reconciliation summary — confirm overlay before authorize (ledger sync full page).
 */
import { LedgerReconSummaryCard } from "@/components/ledger/LedgerReconSummaryCard";
import type {
  LedgerReconSummaryPartyAvatar,
  LedgerReconSummaryPhase,
  LedgerReconSummaryRow,
} from "@/components/ledger/LedgerReconSummaryCard";
import { FinanceTxnTypography } from "@/constants/FinanceTxnTypography";
import Theme from "@/constants/Theme";
import { useEffect, useRef } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

export type { LedgerReconSummaryPartyAvatar, LedgerReconSummaryPhase, LedgerReconSummaryRow } from "@/components/ledger/LedgerReconSummaryCard";

export type LedgerReconSummaryModalProps = {
  visible: boolean;
  amountText: string;
  direction: "in" | "out";
  rows: LedgerReconSummaryRow[];
  isEditMode?: boolean;
  phase?: LedgerReconSummaryPhase;
  /** Mobile wizard: overlay only during submit/success (review is inline). */
  progressOnly?: boolean;
  partyAvatar?: LedgerReconSummaryPartyAvatar;
  onClose: () => void;
  onConfirm: () => void;
  onSuccessComplete?: () => void;
};

export function LedgerReconSummaryModal({
  visible,
  amountText,
  direction,
  rows,
  isEditMode = false,
  phase = "review",
  progressOnly = false,
  partyAvatar,
  onClose,
  onConfirm,
  onSuccessComplete,
}: LedgerReconSummaryModalProps) {
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSuccess = phase === "success";
  const isSubmitting = phase === "submitting";

  useEffect(() => {
    if (!visible || !isSuccess) return;
    successTimerRef.current = setTimeout(() => {
      onSuccessComplete?.();
    }, 2200);
    return () => {
      if (successTimerRef.current) clearTimeout(successTimerRef.current);
    };
  }, [visible, isSuccess, onSuccessComplete]);

  const dismissBlocked = isSubmitting || isSuccess;
  const showActions = !isSuccess && !progressOnly;

  return (
    <Modal
      transparent
      visible={visible}
      animationType="none"
      onRequestClose={dismissBlocked ? undefined : onClose}
    >
      <View style={styles.backdrop}>
        {!dismissBlocked ? (
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" />
        ) : (
          <View style={StyleSheet.absoluteFill} />
        )}

        <View style={[styles.card, Platform.OS !== "web" && styles.cardMobile]}>
          <LedgerReconSummaryCard
            amountText={amountText}
            direction={direction}
            rows={rows}
            isEditMode={isEditMode}
            phase={phase}
            variant="card"
            partyAvatar={partyAvatar}
          />

          {showActions ? (
            <View style={styles.actions}>
              <TouchableOpacity
                style={[styles.btnGhost, isSubmitting && styles.btnDisabled]}
                onPress={onClose}
                disabled={isSubmitting}
                activeOpacity={0.88}
              >
                <Text style={styles.btnGhostText}>Go Back</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btnPrimary, isSubmitting && styles.btnDisabled]}
                onPress={onConfirm}
                disabled={isSubmitting}
                activeOpacity={0.9}
              >
                {isSubmitting ? (
                  <ActivityIndicator size="small" color={Theme.textOnDark} />
                ) : (
                  <Text style={styles.btnPrimaryText} numberOfLines={2}>
                    {isEditMode ? "Save Changes" : "Confirm Sync"}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          ) : isSuccess ? (
            <TouchableOpacity
              style={styles.btnPrimaryWide}
              onPress={() => onSuccessComplete?.()}
              activeOpacity={0.9}
            >
              <Text style={styles.btnPrimaryText}>Continue</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: Theme.overlayBackdrop,
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  card: {
    width: "100%",
    maxWidth: 400,
    maxHeight: "86%",
    backgroundColor: Theme.cardWhite,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    overflow: "hidden",
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 8,
  },
  cardMobile: {
    maxWidth: "100%",
    maxHeight: "90%",
  },
  actions: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
  },
  btnGhost: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
  },
  btnGhostText: {
    ...FinanceTxnTypography.buttonLabel,
    color: Theme.textPrimaryDark,
  },
  btnPrimary: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 14,
    backgroundColor: Theme.primary,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
  },
  btnPrimaryWide: {
    marginHorizontal: 16,
    marginBottom: 14,
    paddingVertical: 13,
    borderRadius: 14,
    backgroundColor: Theme.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  btnPrimaryText: {
    ...FinanceTxnTypography.buttonLabel,
    color: Theme.textOnDark,
    textAlign: "center",
    lineHeight: 13,
  },
  btnDisabled: {
    opacity: 0.65,
  },
});
