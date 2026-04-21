import Theme from "@/constants/Theme";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import React, { useMemo } from "react";
import {
  Alert,
  Image,
  Platform,
  Share,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { FinancialRowData } from "./FinancialRow";

export interface FinanceEntryDetailScreenProps {
  data: FinancialRowData;
  onBack: () => void;
  onDownloadPress?: () => void;
  onOpenCompareVerify?: () => void;
  onViewTripDetail?: () => void;
  embedded?: boolean;
}

function formatNum(n: number): string {
  return n.toLocaleString("en-IN", {
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  });
}

function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const now = Date.now();
    const then = new Date(iso).getTime();
    if (Number.isNaN(then)) return "—";
    const diffDays = Math.max(0, Math.floor((now - then) / (24 * 60 * 60 * 1000)));
    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "1 day ago";
    return `${diffDays} days ago`;
  } catch {
    return "—";
  }
}

function formatCaptureDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}

function detailsRows(data: FinancialRowData): Array<{ label: string; value: string }> {
  const amount = (data.in ?? 0) > 0 ? data.in ?? 0 : data.out ?? 0;
  const tripNumber = data.tripDetail?.trip_number ?? data.msn ?? "—";
  const paymentMode = (data.paymentMode ?? "BANK").trim();
  const settledTo = (data.name ?? "—").trim() || "—";
  const route =
    data.tripDetail != null
      ? `${data.tripDetail.pickup_area ?? "—"} → ${data.tripDetail.drop_location ?? "—"}`
      : "—";
  return [
    { label: "Transaction ID", value: data.id ?? "—" },
    { label: "UTR / Reference", value: data.paymentReference ?? "—" },
    { label: "Payment Mode", value: `${paymentMode}` },
    { label: "Captured At", value: formatCaptureDate(data.transaction_date) },
    { label: "Reference", value: tripNumber },
    { label: "Settled To", value: settledTo },
    { label: "Route", value: route },
    { label: "Amount", value: `₹${formatNum(amount ?? 0)}` },
  ];
}

export function FinanceEntryDetailScreen({
  data,
  onBack,
  onDownloadPress,
  onOpenCompareVerify: _onOpenCompareVerify,
  onViewTripDetail,
  embedded = false,
}: FinanceEntryDetailScreenProps) {
  const insets = useSafeAreaInsets();
  const amount = (data.in ?? 0) > 0 ? data.in ?? 0 : data.out ?? 0;
  const isIn = (data.in ?? 0) > 0;
  const rows = useMemo(() => detailsRows(data), [data]);
  const reference = data.tripDetail?.trip_number ?? data.msn ?? "—";
  const sourceName = (data.name ?? "Fleet").trim() || "Fleet";
  const paymentMeta = (data.paymentMode ?? "Bank").trim() || "Bank";
  const shortRef = data.paymentReference ?? "—";
  const timeLine = formatRelativeTime(data.transaction_date);
  const bankLabel = paymentMeta.split("•")[0]?.trim() || paymentMeta;
  const avatarUrl =
    (data.profileImageUrl ?? "").trim() || (data.organizationImageUrl ?? "").trim() || null;
  const compactRows = rows.filter((r) => r.label !== "Amount");

  const onCopyIdPress = async () => {
    const value = (data.id ?? "").trim();
    if (!value) {
      Alert.alert("Missing ID", "Transaction ID is not available.");
      return;
    }
    try {
      if (Platform.OS === "web" && typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(value);
      }
      Alert.alert("Copied", "Transaction ID copied.");
    } catch {
      Alert.alert("Copy failed", "Unable to copy transaction ID.");
    }
  };

  const onReceiptPress = () => {
    if (onDownloadPress) {
      onDownloadPress();
      return;
    }
    void (async () => {
      try {
        const html = `
          <html><body style="font-family: Inter, Arial; padding: 24px; color:#0f172a;">
            <h2 style="margin:0 0 8px 0;">Settlement Receipt</h2>
            <p style="margin:0 0 16px 0; color:#64748b;">${reference}</p>
            <h1 style="margin:0 0 20px 0;">₹${formatNum(amount)}</h1>
            <table style="width:100%; border-collapse:collapse;">
              <tr><td style="padding:8px 0; color:#64748b;">Transaction ID</td><td style="padding:8px 0; text-align:right;">${data.id ?? "—"}</td></tr>
              <tr><td style="padding:8px 0; color:#64748b;">UTR / Reference</td><td style="padding:8px 0; text-align:right;">${data.paymentReference ?? "—"}</td></tr>
              <tr><td style="padding:8px 0; color:#64748b;">Payment Mode</td><td style="padding:8px 0; text-align:right;">${bankLabel}</td></tr>
              <tr><td style="padding:8px 0; color:#64748b;">Captured At</td><td style="padding:8px 0; text-align:right;">${formatCaptureDate(data.transaction_date)}</td></tr>
              <tr><td style="padding:8px 0; color:#64748b;">Settled To</td><td style="padding:8px 0; text-align:right;">${sourceName}</td></tr>
            </table>
          </body></html>`;
        const { uri } = await Print.printToFileAsync({ html });
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(uri, {
            mimeType: "application/pdf",
            dialogTitle: "Receipt PDF",
            UTI: "com.adobe.pdf",
          });
          return;
        }
        if (Platform.OS === "web" && typeof window !== "undefined") {
          window.open(uri, "_blank");
          return;
        }
        Alert.alert("PDF saved", "Receipt PDF generated successfully.");
      } catch {
        Alert.alert("PDF failed", "Unable to generate receipt PDF right now.");
      }
    })();
  };

  const onSharePress = async () => {
    const shareText =
      `Settlement ${isIn ? "received" : "paid"}\n` +
      `Amount: ₹${formatNum(amount)}\n` +
      `Reference: ${reference}\n` +
      `Captured: ${formatCaptureDate(data.transaction_date)}`;
    try {
      await Share.share({ message: shareText });
    } catch {
      Alert.alert("Share failed", "Unable to share this receipt right now.");
    }
  };

  return (
    <View style={[styles.root, embedded && styles.rootEmbedded]}>
      <StatusBar barStyle="dark-content" />
      {!embedded ? (
        <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
          <TouchableOpacity
            onPress={onBack}
            style={styles.backBtn}
            activeOpacity={0.85}
            accessibilityLabel="Back"
            accessibilityRole="button"
          >
            <FontAwesome name="chevron-left" size={14} color={Theme.textPrimaryDark} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Transaction Receipt</Text>
          <View style={styles.headerSpacer} />
        </View>
      ) : null}

      <View style={[styles.body, embedded && styles.bodyEmbedded]}>
        <View style={[styles.receiptCard, embedded && styles.receiptCardEmbedded]}>
          {!embedded ? (
            <View style={styles.topRow}>
              <View style={styles.sourceWrap}>
                <TouchableOpacity
                  onPress={onBack}
                  style={styles.sourceBackBtn}
                  activeOpacity={0.85}
                  accessibilityLabel={embedded ? "Collapse receipt" : "Back"}
                  accessibilityRole="button"
                >
                  <FontAwesome
                    name={embedded ? "chevron-up" : "chevron-left"}
                    size={12}
                    color={Theme.textSecondary}
                  />
                </TouchableOpacity>
                {avatarUrl ? (
                  <Image source={{ uri: avatarUrl }} style={styles.sourceAvatarImage} />
                ) : (
                  <View style={styles.sourceAvatar}>
                    <Text style={styles.sourceAvatarText}>{sourceName.charAt(0).toUpperCase()}</Text>
                  </View>
                )}
                <View style={styles.sourceTextWrap}>
                  <Text style={styles.sourceName} numberOfLines={1}>
                    {sourceName}
                  </Text>
                  <Text style={styles.sourceMeta} numberOfLines={1}>
                    {paymentMeta} • {shortRef} • {timeLine}
                  </Text>
                </View>
              </View>
              <View style={styles.topAmountWrap}>
                <Text style={[styles.topAmount, isIn ? styles.moneyPositive : styles.moneyNegative]}>
                  {isIn ? "+" : "-"}₹{formatNum(amount)}
                </Text>
                <View style={styles.successRow}>
                  <FontAwesome name="check-circle-o" size={11} color={Theme.driverEmerald} />
                  <Text style={styles.successLabel}>{isIn ? "SUCCESS" : "OUTFLOW"}</Text>
                </View>
              </View>
            </View>
          ) : (
            <View style={styles.embeddedHeadRow}>
              <TouchableOpacity
                onPress={onBack}
                style={styles.sourceBackBtn}
                activeOpacity={0.85}
                accessibilityLabel="Collapse receipt"
                accessibilityRole="button"
              >
                <FontAwesome name="chevron-up" size={12} color={Theme.textSecondary} />
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.receiptPanel}>
            <View style={styles.heroIconWrap}>
              <View style={styles.heroIconCircle}>
                <FontAwesome name="check" size={22} color={Theme.driverEmerald} />
              </View>
              <Text style={styles.heroLabel}>
                {isIn ? "SETTLEMENT RECEIVED" : "SETTLEMENT PAID"}
              </Text>
              <Text style={styles.heroAmount}>₹{formatNum(amount)}</Text>
              <Text style={styles.heroRefLine} numberOfLines={1}>
                {reference} • {formatCaptureDate(data.transaction_date)}
              </Text>
            </View>

            <View style={styles.detailList}>
              {compactRows.map((row) => (
                <View key={row.label} style={styles.detailRow}>
                  <Text style={styles.detailLabel}>{row.label}</Text>
                  <Text
                    style={[
                      styles.detailValue,
                      row.label === "Transaction ID" && styles.detailValueId,
                      row.label === "UTR / Reference" && styles.detailValueRef,
                      row.label === "Settled To" && styles.detailValueBank,
                      row.label === "Route" && styles.detailValueRoute,
                    ]}
                    numberOfLines={1}
                    ellipsizeMode={row.label === "Transaction ID" ? "middle" : "tail"}
                  >
                    {row.label === "Payment Mode" ? bankLabel : row.value}
                  </Text>
                </View>
              ))}
            </View>

            <View style={styles.actionRow}>
              <TouchableOpacity
                style={[styles.actionBtn, styles.actionBtnSecondary, styles.actionBtnWide]}
                onPress={() => {
                  if (onViewTripDetail) {
                    onViewTripDetail();
                    return;
                  }
                  onCopyIdPress();
                }}
                activeOpacity={0.85}
              >
                <FontAwesome name="road" size={12} color={Theme.textSecondary} />
                <Text style={styles.actionBtnSecondaryText}>VIEW TRIP DETAIL</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, styles.actionBtnPrimary, styles.actionBtnWide]}
                onPress={onReceiptPress}
                activeOpacity={0.85}
              >
                <FontAwesome name="file-text-o" size={12} color={Theme.textOnDark} />
                <Text style={styles.actionBtnPrimaryText}>PDF PREVIEW</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, styles.actionBtnSecondary, styles.actionBtnShare]}
                onPress={onSharePress}
                activeOpacity={0.85}
              >
                <FontAwesome name="share-alt" size={12} color={Theme.textSecondary} />
              </TouchableOpacity>
            </View>
          </View>
          {!embedded ? (
            <Text style={styles.footerHint}>
              {reference} • {formatCaptureDate(data.transaction_date)}
            </Text>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Theme.screenBackground,
  },
  rootEmbedded: {
    flex: 0,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  headerTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  headerSpacer: {
    width: 30,
  },
  body: {
    flex: 1,
    paddingHorizontal: 12,
    paddingBottom: 14,
  },
  bodyEmbedded: {
    paddingHorizontal: 10,
    paddingBottom: 10,
    alignItems: "center",
  },
  receiptCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Theme.surfaceBorder,
    backgroundColor: Theme.surfaceLight,
    overflow: "hidden",
  },
  receiptCardEmbedded: {
    borderRadius: 18,
    width: "100%",
    maxWidth: 640,
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 5,
  },
  embeddedHeadRow: {
    alignItems: "flex-start",
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 2,
  },
  backBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: Theme.surfaceBorder,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.surface,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Theme.surfaceBorder,
    gap: 8,
  },
  sourceWrap: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  sourceBackBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.surfaceBorder,
  },
  sourceAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.surfaceGray,
    borderWidth: 1,
    borderColor: Theme.surfaceBorder,
  },
  sourceAvatarImage: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: Theme.surfaceBorder,
    backgroundColor: Theme.surfaceGray,
  },
  sourceAvatarText: {
    fontSize: 14,
    fontWeight: "800",
    color: Theme.textSecondary,
  },
  sourceTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  sourceName: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "lowercase",
    color: Theme.textPrimaryDark,
  },
  sourceMeta: {
    marginTop: 1,
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textSecondary,
    letterSpacing: 0.9,
    textTransform: "uppercase",
  },
  topAmountWrap: {
    alignItems: "flex-end",
    minWidth: 96,
  },
  topAmount: {
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: -0.2,
  },
  successRow: {
    marginTop: 2,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  successLabel: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.driverEmerald,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  receiptPanel: {
    marginHorizontal: 10,
    marginTop: 4,
    marginBottom: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Theme.surfaceBorder,
    backgroundColor: Theme.screenBackground,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  moneyPositive: {
    color: Theme.driverEmerald,
  },
  moneyNegative: {
    color: Theme.teslaRed,
  },
  heroIconWrap: {
    alignItems: "center",
    paddingTop: 8,
    paddingBottom: 6,
  },
  heroIconCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.driverEmeraldMuted,
  },
  heroLabel: {
    marginTop: 7,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1.7,
    color: Theme.driverEmerald,
    textTransform: "uppercase",
  },
  heroAmount: {
    marginTop: 2,
    fontSize: 32,
    fontWeight: "900",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.8,
  },
  heroRefLine: {
    marginTop: 3,
    fontSize: 6,
    fontWeight: "600",
    color: Theme.textSecondary,
    letterSpacing: 0.45,
    textTransform: "uppercase",
  },
  detailList: {
    borderTopWidth: 1,
    borderTopColor: Theme.surfaceBorder,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderStyle: "solid",
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: Theme.surfaceBorder,
  },
  detailLabel: {
    width: 112,
    fontSize: 6,
    fontWeight: "700",
    color: Theme.textSecondary,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    lineHeight: 9,
  },
  detailValue: {
    flex: 1,
    minWidth: 0,
    textAlign: "right",
    fontSize: 7,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.05,
    lineHeight: 10,
  },
  detailValueId: {
    fontSize: 7,
    fontWeight: "900",
    letterSpacing: 0,
  },
  detailValueRef: {
    fontSize: 7,
    fontWeight: "800",
    letterSpacing: 0,
  },
  detailValueBank: {
    fontSize: 7,
    fontWeight: "900",
    letterSpacing: 0,
  },
  detailValueRoute: {
    fontSize: 7,
    fontWeight: "600",
    letterSpacing: 0,
    color: Theme.textSecondary,
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 6,
  },
  actionBtn: {
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 5,
  },
  actionBtnWide: {
    flex: 1,
  },
  actionBtnShare: {
    width: 34,
    minWidth: 34,
    maxWidth: 34,
    borderRadius: 17,
    paddingHorizontal: 0,
  },
  actionBtnSecondary: {
    borderWidth: 1,
    borderColor: Theme.surfaceBorder,
    backgroundColor: Theme.surfaceGray,
  },
  actionBtnPrimary: {
    backgroundColor: Theme.driverEmerald,
    shadowColor: Theme.driverEmerald,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 6,
  },
  actionBtnSecondaryText: {
    fontSize: 7,
    fontWeight: "800",
    color: Theme.textSecondary,
    letterSpacing: 0.6,
  },
  actionBtnPrimaryText: {
    fontSize: 7,
    fontWeight: "900",
    color: Theme.textOnDark,
    letterSpacing: 0.6,
  },
  footerHint: {
    marginTop: 4,
    marginBottom: 10,
    textAlign: "center",
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textSecondary,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
});
