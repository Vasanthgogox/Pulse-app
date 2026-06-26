import Theme from "@/constants/Theme";
import { ClientAnalyticsKpiLottie } from "@/features/clients/components/analytics/ClientAnalyticsKpiLottie";
import { TRIP_MARGIN_LOTTIE } from "@/features/trips/components/trip-detail/tripMarginAssets";
import { METRONIC } from "@/features/network/components/desktop/networkDesktopHub.styles";
import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";

type Props = {
  message: string;
  tone?: "positive" | "negative" | "warning" | "info" | "neutral";
};

function marginLottieForMessage(message: string, tone?: Props["tone"]) {
  const lower = message.toLowerCase();
  if (!lower.includes("margin")) return null;
  if (tone === "negative" || lower.includes("thin") || lower.includes("loss")) {
    return TRIP_MARGIN_LOTTIE.loss;
  }
  if (tone === "positive" || lower.includes("high-yield") || lower.includes("strong")) {
    return TRIP_MARGIN_LOTTIE.profit;
  }
  return TRIP_MARGIN_LOTTIE.flat;
}

export const ClientAnalyticsInsightRow = memo(function ClientAnalyticsInsightRow({
  message,
  tone = "neutral",
}: Props) {
  const clean = message.replace(/\*\*/g, "");
  const lottie = marginLottieForMessage(clean, tone);
  const toneStyle =
    tone === "positive"
      ? styles.rowPositive
      : tone === "negative"
        ? styles.rowNegative
        : tone === "warning"
          ? styles.rowWarning
          : null;

  return (
    <View style={[styles.row, toneStyle]}>
      {lottie ? (
        <View style={styles.lottieSlot}>
          <ClientAnalyticsKpiLottie source={lottie} size={28} />
        </View>
      ) : null}
      <Text style={styles.text}>{clean}</Text>
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: METRONIC.border,
    marginTop: 8,
  },
  rowPositive: {
    backgroundColor: Theme.positiveMutedDark,
    borderColor: Theme.positiveMutedDarkBorder,
  },
  rowNegative: {
    backgroundColor: Theme.negativeMuted,
    borderColor: "rgba(220,38,38,0.2)",
  },
  rowWarning: {
    backgroundColor: "#FFFBEB",
    borderColor: "#FDE68A",
  },
  lottieSlot: {
    marginTop: -2,
  },
  text: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    fontWeight: "600",
    color: METRONIC.text,
    lineHeight: 19,
  },
});
