/**
 * Shared reconciliation summary card — inline (mobile review) or inside modal.
 */
import { FinanceTxnTypography } from "@/constants/FinanceTxnTypography";
import { LedgerSyncPalette } from "@/constants/LedgerSyncPalette";
import Theme from "@/constants/Theme";
import { LEDGER_RECON_LOTTIE } from "@/lib/ledgerReconLottieAssets";
import LottieView from "lottie-react-native";
import { useMemo } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

export type LedgerReconSummaryRow = {
  label: string;
  value: string;
};

export type LedgerReconSummaryPhase = "review" | "submitting" | "success";

const LABEL_WIDTH = 108;

function ReconLottieGlyph({
  source,
  size = 44,
  loop = true,
  speed = 0.85,
}: {
  source: object;
  size?: number;
  loop?: boolean;
  speed?: number;
}) {
  const scale = 1.55;
  const renderSize = Math.round(size * scale);
  const offset = (size - renderSize) / 2;
  return (
    <View style={[styles.lottieSlot, { width: size, height: size }]}>
      <LottieView
        source={source}
        autoPlay
        loop={loop}
        speed={speed}
        resizeMode="contain"
        style={{
          width: renderSize,
          height: renderSize,
          position: "absolute",
          left: offset,
          top: offset,
        }}
      />
    </View>
  );
}

export type LedgerReconSummaryCardProps = {
  amountText: string;
  direction: "in" | "out";
  rows: LedgerReconSummaryRow[];
  isEditMode?: boolean;
  phase?: LedgerReconSummaryPhase;
  /** Inline mobile review — no outer card chrome. */
  variant?: "card" | "flat";
};

export function LedgerReconSummaryCard({
  amountText,
  direction,
  rows,
  isEditMode = false,
  phase = "review",
  variant = "card",
}: LedgerReconSummaryCardProps) {
  const isSuccess = phase === "success";
  const isSubmitting = phase === "submitting";
  const amountColor = direction === "in" ? Theme.darkGreen : Theme.primary;

  const heroLottie = useMemo(() => {
    if (isSuccess) return LEDGER_RECON_LOTTIE.success;
    if (isSubmitting) return LEDGER_RECON_LOTTIE.submitting;
    if (direction === "in") return LEDGER_RECON_LOTTIE.cashIn;
    return LEDGER_RECON_LOTTIE.cashOut;
  }, [direction, isSubmitting, isSuccess]);

  const statusLabel = isSuccess
    ? "Synced"
    : isSubmitting
      ? "Saving…"
      : "Ready";

  const rootStyle = variant === "card" ? styles.card : styles.flat;

  return (
    <View style={rootStyle}>
      <View style={styles.header}>
        <ReconLottieGlyph
          source={heroLottie}
          size={isSuccess ? 48 : 40}
          loop={!isSuccess}
          speed={isSuccess ? 1 : 0.85}
        />
        <View style={styles.headerText}>
          <Text style={styles.sectionEyebrow}>
            {isSuccess
              ? "Sync complete"
              : isSubmitting
                ? "Authorizing"
                : "Reconciliation Summary"}
          </Text>
          <View style={styles.amountRow}>
            <Text style={[styles.amountPrefix, { color: amountColor }]}>₹</Text>
            <Text
              style={[styles.amountValue, { color: amountColor }]}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {amountText}
            </Text>
          </View>
          <View style={styles.metaRow}>
            <View style={styles.statusPill}>
              {isSubmitting ? (
                <ActivityIndicator size="small" color={Theme.textMuted} />
              ) : null}
              <Text style={styles.statusPillText}>{statusLabel}</Text>
            </View>
            <Text style={styles.metaDot}>·</Text>
            <Text style={styles.metaDirection}>
              {direction === "in" ? "Cash In" : "Cash Out"}
            </Text>
          </View>
        </View>
      </View>

      {isSuccess ? (
        <View style={styles.successBody}>
          <Text style={styles.successBlurb}>
            {isEditMode
              ? "Your ledger entry has been updated on Pulse."
              : "Payment is live on your books and ready to reconcile."}
          </Text>
          <Text style={styles.successHint}>Closing in a moment…</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          bounces={false}
          nestedScrollEnabled
        >
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
              <Text style={styles.detailValue} numberOfLines={4}>
                {row.value}
              </Text>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: "100%",
    backgroundColor: Theme.cardWhite,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    overflow: "hidden",
  },
  flat: {
    width: "100%",
    backgroundColor: Theme.cardWhite,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
    gap: 4,
    paddingTop: 2,
  },
  sectionEyebrow: {
    ...FinanceTxnTypography.columnTitle,
    color: Theme.textMuted,
    marginBottom: 2,
  },
  amountRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 3,
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
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 4,
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: LedgerSyncPalette.page,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
  },
  statusPillText: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: Theme.textSecondary,
  },
  metaDot: {
    fontSize: 10,
    color: Theme.textMuted,
  },
  metaDirection: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textSecondary,
    letterSpacing: 0.2,
  },
  scroll: {
    flexGrow: 0,
    flexShrink: 1,
    maxHeight: 320,
    backgroundColor: Theme.cardWhite,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
  },
  detailRowLast: {
    borderBottomWidth: 0,
  },
  detailLabel: {
    ...FinanceTxnTypography.fieldLabel,
    width: LABEL_WIDTH,
    flexShrink: 0,
    lineHeight: 13,
    paddingTop: 1,
    color: Theme.textMuted,
  },
  detailValue: {
    ...FinanceTxnTypography.fieldValue,
    flex: 1,
    minWidth: 0,
    textAlign: "right",
    lineHeight: 17,
    color: Theme.textPrimaryDark,
    fontStyle: "normal",
  },
  successBody: {
    paddingHorizontal: 20,
    paddingVertical: 20,
    gap: 8,
    backgroundColor: Theme.cardWhite,
  },
  successBlurb: {
    fontSize: 13,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    lineHeight: 18,
    textAlign: "center",
  },
  successHint: {
    fontSize: 11,
    fontWeight: "500",
    color: Theme.textMuted,
    textAlign: "center",
  },
  lottieSlot: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "visible",
    marginTop: 2,
  },
});
