import { LoadingIndicator } from "@/components/LoadingIndicator";
import { ThemedConfirmModal } from "@/components/ThemedConfirmModal";
import Theme from "@/constants/Theme";
import { useDriverTheme, useDriverThemeColors } from "@/contexts/DriverThemeContext";
import { TripPaymentAmountGrid } from "@/features/driver/components/TripPaymentAmountGrid";
import { useDriverTripSettlement } from "@/features/driver/hooks/useDriverTripSettlement";
import {
  buildMarkPaidConfirmMessage,
  formatDriverPaymentModeLabel,
  deriveDriverPaymentMode,
  extractDriverPaymentUtr,
  type DriverTripSettlementTone,
} from "@/features/driver/tripSettlement/driverTripSettlement.util";
import {
  getEarning,
  getGrossRevenue,
} from "@/features/driver/tripHistory/tripHistoryDetail.util";
import { tripHistoryDetailStyles as styles } from "@/features/driver/tripHistory/tripHistoryDetail.styles";
import { phonePeMetaDate } from "@/lib/driverGpayTransactions";
import type { TripRow } from "@/services/tripsService";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { type Href, useRouter } from "expo-router";
import {
  Banknote,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Info,
  Shield,
  ShieldCheck,
  Sparkles,
  Wallet,
} from "lucide-react-native";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

type TripDetailSettlementPanelProps = {
  trip: TripRow;
};

function tonePillStyle(tone: DriverTripSettlementTone, isDark: boolean) {
  switch (tone) {
    case "success":
    case "fleet":
      return {
        backgroundColor: "#ecfdf5",
        borderColor: "#a7f3d0",
        color: Theme.driverEmerald,
      };
    case "warning":
      return {
        backgroundColor: "#fff7ed",
        borderColor: "#fed7aa",
        color: "#c2410c",
      };
    case "info":
      return {
        backgroundColor: "#eff6ff",
        borderColor: "#bfdbfe",
        color: "#1d4ed8",
      };
    default:
      return {
        backgroundColor: isDark ? "rgba(148,163,184,0.12)" : "#f8fafc",
        borderColor: isDark ? "rgba(148,163,184,0.22)" : "#e2e8f0",
        color: isDark ? "#94a3b8" : "#64748b",
      };
  }
}

export function TripDetailSettlementPanel({ trip }: TripDetailSettlementPanelProps) {
  const colors = useDriverThemeColors();
  const { theme } = useDriverTheme();
  const isDark = theme === "dark";
  const router = useRouter();
  const {
    settlementView,
    loading,
    requestPaymentLoading,
    markPaidLoading,
    requestPayment,
    confirmMarkAsPaid,
    markTripAsPaid,
    shareSettlementReceipt,
    shareSettlementPdf,
    markPaidConfirmState,
    setMarkPaidConfirmState,
    settledSuccessState,
    setSettledSuccessState,
  } = useDriverTripSettlement(trip);

  if (loading || !settlementView) {
    return (
      <View style={panelStyles.loadingWrap}>
        <LoadingIndicator size="small" color={colors.emerald} />
      </View>
    );
  }

  const pill = tonePillStyle(settlementView.statusTone, isDark);
  const capturedAt = settlementView.capturedAtRaw
    ? phonePeMetaDate(settlementView.capturedAtRaw)
    : "—";
  const showPaymentMeta =
    settlementView.status === "settled" || settlementView.status === "fleet_marked";

  return (
    <View style={{ marginBottom: 12 }}>
      {settlementView.status === "incomplete" ? (
        <View
          style={[
            panelStyles.incompleteBanner,
            {
              backgroundColor: isDark ? colors.surfaceElevated : "#f8fafc",
              borderColor: colors.border,
            },
          ]}
        >
          <Text style={[panelStyles.incompleteText, { color: colors.textMuted }]}>
            Payment actions unlock after the trip is marked complete.
          </Text>
        </View>
      ) : null}

      <View style={styles.tdSettlementGlow}>
        <View
          style={[
            styles.tdNetCard,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
            },
          ]}
        >
          <View style={styles.tdNetBlur} pointerEvents="none" />
          <View style={styles.tdNetHeader}>
            <View style={styles.tdNetWalletIcon}>
              <Wallet size={16} color={colors.emerald} />
            </View>
            <Text style={[styles.tdNetKicker, { color: colors.textMuted }]}>
              {settlementView.status === "settled" ? "Net payout" : "Expected payout"}
            </Text>
            <View style={styles.tdNetAmountRow}>
              {settlementView.isSalary ? null : (
                <Text style={[styles.tdNetRupee, { color: colors.textMuted }]}>₹</Text>
              )}
              <Text
                style={[styles.tdNetAmount, { color: colors.text }]}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {settlementView.isSalary
                  ? "SALARY"
                  : Math.round(settlementView.amount).toLocaleString("en-IN")}
              </Text>
            </View>
            {settlementView.hasPaymentShortfall && settlementView.status === "fleet_marked" ? (
              <Text style={[panelStyles.amountSub, { color: colors.textMuted }]}>
                of ₹{settlementView.expectedAmount.toLocaleString("en-IN")} trip earning
              </Text>
            ) : settlementView.partialPaymentAccepted ? (
              <Text style={[panelStyles.amountSub, { color: Theme.negative }]}>
                ₹{settlementView.writeOffAmount.toLocaleString("en-IN")} written off
              </Text>
            ) : null}
            <View
              style={[
                panelStyles.statusPill,
                { backgroundColor: pill.backgroundColor, borderColor: pill.borderColor },
              ]}
            >
              {(settlementView.status === "settled" || settlementView.status === "fleet_marked") && (
                <CheckCircle2 size={10} color={pill.color} />
              )}
              <Text style={[panelStyles.statusPillText, { color: pill.color }]}>
                {settlementView.statusLabel}
              </Text>
            </View>
            <Text style={[panelStyles.fleetLine, { color: colors.textMuted }]}>
              {settlementView.fleetName}
            </Text>
          </View>

          {!settlementView.isSalary ? (
            <View style={{ marginTop: 12 }}>
              <TripPaymentAmountGrid
              expectedAmount={settlementView.expectedAmount}
              paymentAmount={settlementView.amount}
              outstandingAmount={settlementView.outstandingAmount}
              writeOffAmount={settlementView.writeOffAmount}
              hasPaymentShortfall={settlementView.hasPaymentShortfall}
              mode={
                settlementView.status === "settled"
                  ? "settled"
                  : settlementView.status === "fleet_marked"
                    ? "fleet_marked"
                    : "pending"
              }
              colors={colors}
              isDark={isDark}
            />
            </View>
          ) : null}
        </View>
      </View>

      {showPaymentMeta ? (
        <View
          style={[
            panelStyles.paymentMetaCard,
            {
              borderColor: isDark ? colors.borderSubtle : "#e2e8f0",
              backgroundColor: isDark ? colors.surfaceElevated : "#f8fafc",
            },
          ]}
        >
          <Text style={[panelStyles.paymentMetaTitle, { color: colors.text }]}>
            Payment details
          </Text>
          <View style={panelStyles.paymentMetaGrid}>
            <View style={panelStyles.paymentMetaCell}>
              <Text style={[panelStyles.paymentMetaLabel, { color: colors.textMuted }]}>Mode</Text>
              <Text style={[panelStyles.paymentMetaValue, { color: colors.text }]}>
                {formatDriverPaymentModeLabel(settlementView.paymentMode)}
              </Text>
            </View>
            <View style={[panelStyles.paymentMetaDivider, { backgroundColor: colors.border }]} />
            <View style={panelStyles.paymentMetaCell}>
              <Text style={[panelStyles.paymentMetaLabel, { color: colors.textMuted }]}>UTR</Text>
              <Text style={[panelStyles.paymentMetaValue, { color: colors.text }]} numberOfLines={1}>
                {settlementView.utr ?? "—"}
              </Text>
            </View>
          </View>
          <Text style={[panelStyles.paymentMetaTimestamp, { color: colors.textMuted }]}>
            {settlementView.status === "fleet_marked" ? "Marked" : "Settled"} {capturedAt}
          </Text>
        </View>
      ) : null}

      {settlementView.canVerifyFleetPayment ? (
        <View
          style={[
            panelStyles.verifyPanel,
            {
              borderColor: isDark ? colors.borderSubtle : "#e2e8f0",
              backgroundColor: isDark ? "rgba(4,120,87,0.07)" : "rgba(248,250,252,0.92)",
            },
          ]}
        >
          <View style={panelStyles.verifyHeader}>
            <View style={[panelStyles.verifyIcon, { backgroundColor: colors.emeraldMuted }]}>
              <Shield size={11} color={colors.emerald} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[panelStyles.verifyTitle, { color: colors.text }]}>
                Confirm fleet payment
              </Text>
              <Text style={[panelStyles.verifySub, { color: colors.textMuted }]}>
                {settlementView.hasPaymentShortfall
                  ? `${settlementView.fleetName} marked ₹${settlementView.amount.toLocaleString("en-IN")} of ₹${settlementView.expectedAmount.toLocaleString("en-IN")} trip earning via ${formatDriverPaymentModeLabel(settlementView.paymentMode)}. ₹${settlementView.outstandingAmount.toLocaleString("en-IN")} outstanding — you can accept the partial amount.`
                  : `${settlementView.fleetName} marked ₹${settlementView.amount.toLocaleString("en-IN")} via ${formatDriverPaymentModeLabel(settlementView.paymentMode)}`}
              </Text>
            </View>
          </View>
          <TouchableOpacity
            style={[panelStyles.actionPrimary, { backgroundColor: colors.emerald }]}
            onPress={() => confirmMarkAsPaid(settlementView.fleetPendingLedger)}
            disabled={markPaidLoading}
            activeOpacity={0.88}
          >
            {markPaidLoading ? (
              <ActivityIndicator size="small" color={Theme.textOnPrimary} />
            ) : (
              <>
                <FontAwesome name="check" size={12} color={Theme.textOnPrimary} />
                <Text style={panelStyles.actionPrimaryText}>
                  {settlementView.hasPaymentShortfall
                    ? `Accept ₹${settlementView.amount.toLocaleString("en-IN")} and write off ₹${settlementView.writeOffAmount.toLocaleString("en-IN")}`
                    : "Verify payment"}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      ) : null}

      {(settlementView.canRequestPayment || settlementView.canMarkAsPaid) &&
      !settlementView.canVerifyFleetPayment ? (
        <View style={panelStyles.actionRow}>
          {settlementView.canRequestPayment ? (
            <TouchableOpacity
              style={[panelStyles.actionPrimary, { backgroundColor: colors.emerald, flex: 1 }]}
              onPress={() => void requestPayment()}
              disabled={requestPaymentLoading}
              activeOpacity={0.88}
            >
              {requestPaymentLoading ? (
                <ActivityIndicator size="small" color={Theme.textOnPrimary} />
              ) : (
                <>
                  <FontAwesome name="whatsapp" size={12} color={Theme.textOnPrimary} />
                  <Text style={panelStyles.actionPrimaryText}>Request payment</Text>
                </>
              )}
            </TouchableOpacity>
          ) : null}
          {settlementView.canMarkAsPaid ? (
            <TouchableOpacity
              style={[
                panelStyles.actionSecondary,
                {
                  flex: 1,
                  backgroundColor: isDark ? colors.surfaceElevated : "#ffffff",
                  borderColor: isDark ? colors.borderSubtle : "#e2e8f0",
                },
              ]}
              onPress={() => confirmMarkAsPaid(null)}
              disabled={markPaidLoading}
              activeOpacity={0.88}
            >
              {markPaidLoading ? (
                <ActivityIndicator size="small" color={colors.emerald} />
              ) : (
                <>
                  <FontAwesome name="check" size={12} color={colors.emerald} />
                  <Text style={[panelStyles.actionSecondaryText, { color: colors.textMuted }]}>
                    Mark as paid
                  </Text>
                </>
              )}
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      {settlementView.canShareReceipt ? (
        <View style={panelStyles.actionRow}>
          <TouchableOpacity
            style={[
              panelStyles.actionSecondary,
              {
                flex: 1,
                backgroundColor: isDark ? colors.surfaceElevated : "#ffffff",
                borderColor: isDark ? colors.borderSubtle : "#e2e8f0",
              },
            ]}
            onPress={() => void shareSettlementReceipt()}
            activeOpacity={0.88}
          >
            <FontAwesome name="share-square-o" size={12} color={colors.textMuted} />
            <Text style={[panelStyles.actionSecondaryText, { color: colors.textMuted }]}>Share</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[panelStyles.actionPrimary, { backgroundColor: colors.emerald, flex: 1 }]}
            onPress={() => void shareSettlementPdf()}
            activeOpacity={0.88}
          >
            <FontAwesome name="file-pdf-o" size={12} color={Theme.textOnPrimary} />
            <Text style={panelStyles.actionPrimaryText}>PDF receipt</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {settlementView.isSalary ? (
        <TouchableOpacity
          style={[
            styles.tdQueryBtn,
            { backgroundColor: colors.surface, borderColor: colors.border, marginBottom: 10 },
          ]}
          activeOpacity={0.85}
          onPress={() => router.push("/(driver)/salary-request" as Href)}
        >
          <Text style={[styles.tdQueryBtnText, { color: colors.textMuted }]}>
            Request salary from fleet
          </Text>
          <ChevronRight size={14} color={colors.textMuted} />
        </TouchableOpacity>
      ) : null}

      <View style={styles.tdEarningsHeader}>
        <Text style={[styles.tdEarningsHeaderTitle, { color: colors.textMuted }]}>
          Earnings detail
        </Text>
        <Info size={14} color={colors.textMuted} />
      </View>

      <View
        style={[
          styles.tdBreakdownCard,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
      >
        <View style={styles.tdBreakRow}>
          <View style={styles.tdBreakLeft}>
            <View style={[styles.tdBreakIcon, { backgroundColor: colors.border }]}>
              <Banknote size={15} color={colors.textMuted} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[styles.tdBreakTitle, { color: colors.text }]}>Base fare</Text>
              <Text style={[styles.tdBreakSub, { color: colors.textMuted }]}>
                Trip commission from fleet
              </Text>
            </View>
          </View>
          <Text style={[styles.tdBreakValue, { color: colors.text }]}>
            {getGrossRevenue(trip) === "SALARY"
              ? "SALARY"
              : `₹${Number(getGrossRevenue(trip)).toLocaleString()}`}
          </Text>
        </View>

        <View style={[styles.tdBreakRowHighlight, { backgroundColor: `${colors.emerald}18` }]}>
          <View style={styles.tdBreakLeft}>
            <View style={[styles.tdBreakIcon, { backgroundColor: `${colors.emerald}33` }]}>
              <Sparkles size={15} color={colors.emerald} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[styles.tdBreakTitle, { color: colors.text }]}>Driver earning</Text>
              <Text style={[styles.tdBreakSub, { color: colors.textMuted }]}>
                Amount eligible for settlement
              </Text>
            </View>
          </View>
          <Text style={[styles.tdBreakValue, { color: colors.emerald }]}>
            {getEarning(trip) === "SALARY" ? "—" : getEarning(trip)}
          </Text>
        </View>

        <View style={styles.tdBreakRow}>
          <View style={styles.tdBreakLeft}>
            <View style={[styles.tdBreakIcon, { backgroundColor: `${Theme.negative}22` }]}>
              <ShieldCheck size={15} color={Theme.negative} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[styles.tdBreakTitle, { color: colors.text }]}>Deductions</Text>
              <Text style={[styles.tdBreakSub, { color: colors.textMuted }]}>
                TDS / platform (if any)
              </Text>
            </View>
          </View>
          <Text style={[styles.tdBreakValue, { color: Theme.negative }]}>-₹0</Text>
        </View>
      </View>

      {settlementView.status === "settled" ? (
        <View style={styles.tdSettledBar}>
          <View style={styles.tdSettledLeft}>
            <View style={styles.tdSettledCalWrap}>
              <Calendar size={16} color="#ffffff" />
            </View>
            <View>
              <Text style={styles.tdSettledK}>Settled on</Text>
              <Text style={styles.tdSettledV}>{capturedAt}</Text>
            </View>
          </View>
        </View>
      ) : null}

      <TouchableOpacity
        style={[
          styles.tdQueryBtn,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
        activeOpacity={0.85}
        onPress={() => router.push("/(driver)/wallet" as Href)}
      >
        <Text style={[styles.tdQueryBtnText, { color: colors.textMuted }]}>
          Open earnings & trips
        </Text>
        <ChevronRight size={14} color={colors.textMuted} />
      </TouchableOpacity>

      <ThemedConfirmModal
        variant="positive"
        visible={!!markPaidConfirmState}
        title={
          markPaidConfirmState?.sourceLedger ? "Verify fleet payment" : "Mark as paid"
        }
        message={
          markPaidConfirmState && settlementView
            ? buildMarkPaidConfirmMessage({
                tripDisplay: settlementView.displayId,
                expectedAmount: settlementView.expectedAmount,
                paymentAmount: markPaidConfirmState.amount,
                writeOffAmount: settlementView.writeOffAmount,
                hasPaymentShortfall: settlementView.hasPaymentShortfall,
                utr: markPaidConfirmState.sourceLedger
                  ? extractDriverPaymentUtr(markPaidConfirmState.sourceLedger.description)
                  : null,
                mode: markPaidConfirmState.sourceLedger
                  ? deriveDriverPaymentMode(markPaidConfirmState.sourceLedger.description)
                  : null,
                isFleetVerify: !!markPaidConfirmState.sourceLedger,
              })
            : ""
        }
        cancelText="Cancel"
        confirmText={markPaidLoading ? "Saving…" : "Proceed"}
        confirmVariant="primary"
        onCancel={() => {
          if (!markPaidLoading) setMarkPaidConfirmState(null);
        }}
        onConfirm={() => {
          const next = markPaidConfirmState;
          if (!next) return;
          setMarkPaidConfirmState(null);
          void markTripAsPaid(next.trip, next.amount, next.sourceLedger ?? null);
        }}
      />

      <ThemedConfirmModal
        variant="positive"
        visible={!!settledSuccessState}
        title="Payment settled"
        message={
          settledSuccessState
            ? settledSuccessState.writeOffAmount
              ? `${settledSuccessState.tripDisplay} · ₹${settledSuccessState.amount.toLocaleString("en-IN")} verified · ₹${settledSuccessState.writeOffAmount.toLocaleString("en-IN")} written off.`
              : `${settledSuccessState.tripDisplay} · ₹${settledSuccessState.amount.toLocaleString("en-IN")} has been verified and marked as settled.`
            : ""
        }
        cancelText="Done"
        confirmText="Open earnings"
        onCancel={() => setSettledSuccessState(null)}
        onConfirm={() => {
          setSettledSuccessState(null);
          router.push("/(driver)/wallet" as Href);
        }}
      />
    </View>
  );
}

const panelStyles = StyleSheet.create({
  loadingWrap: {
    paddingVertical: 24,
    alignItems: "center",
  },
  incompleteBanner: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
  },
  incompleteText: {
    fontSize: 11,
    fontWeight: "500",
    lineHeight: 15,
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    marginTop: 8,
  },
  statusPillText: {
    fontSize: 9,
    fontWeight: "500",
    textTransform: "uppercase",
    letterSpacing: 0.55,
  },
  fleetLine: {
    marginTop: 6,
    fontSize: 11,
    fontWeight: "500",
  },
  amountSub: {
    marginTop: 2,
    fontSize: 10,
    fontWeight: "500",
    textAlign: "center",
  },
  paymentMetaCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
    gap: 8,
  },
  paymentMetaTitle: {
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: -0.1,
  },
  paymentMetaGrid: {
    flexDirection: "row",
    alignItems: "stretch",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(226,232,240,0.9)",
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: "#ffffff",
  },
  paymentMetaCell: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 8,
    paddingVertical: 6,
    gap: 1,
  },
  paymentMetaDivider: {
    width: StyleSheet.hairlineWidth,
  },
  paymentMetaLabel: {
    fontSize: 8,
    fontWeight: "500",
    letterSpacing: 0.2,
  },
  paymentMetaValue: {
    fontSize: 10,
    fontWeight: "500",
  },
  paymentMetaTimestamp: {
    fontSize: 9,
    fontWeight: "400",
  },
  verifyPanel: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
    gap: 10,
  },
  verifyHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  verifyIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  verifyTitle: {
    fontSize: 11,
    fontWeight: "500",
  },
  verifySub: {
    fontSize: 10,
    fontWeight: "400",
    lineHeight: 14,
    marginTop: 1,
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 8,
    marginBottom: 10,
  },
  actionPrimary: {
    minHeight: 40,
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 10,
  },
  actionPrimaryText: {
    fontSize: 11,
    fontWeight: "500",
    color: Theme.textOnPrimary,
  },
  actionSecondary: {
    minHeight: 40,
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  actionSecondaryText: {
    fontSize: 11,
    fontWeight: "500",
  },
});
