/**
 * Grow your network — discovery stats + daily invite progress (pairs with Invite via Link).
 */
import Theme from "@/constants/Theme";
import { DAILY_CONNECTION_INVITE_LIMIT } from "@/features/connections/services/connectionRequests.service";
import { useLanguage } from "@/contexts/LanguageContext";
import LottieView from "lottie-react-native";
import { Platform, StyleSheet, Text, View, type ViewStyle } from "react-native";

function interpolate(
  template: string,
  vars: Record<string, string | number>,
): string {
  return Object.entries(vars).reduce(
    (acc, [key, value]) =>
      acc.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), String(value)),
    template,
  );
}

export type NetworkGrowSummaryCardProps = {
  discoverCount: number;
  totalConnections: number;
  todayInviteCount: number;
  dailyInviteLimit?: number;
  style?: ViewStyle;
  /** Parent section already shows "Grow your network" — stats-only layout. */
  hideTitle?: boolean;
  /** Flat section inside a parent card (no nested border/shadow). */
  variant?: "card" | "inline";
};

export function NetworkGrowSummaryCard({
  discoverCount,
  totalConnections,
  todayInviteCount,
  dailyInviteLimit = DAILY_CONNECTION_INVITE_LIMIT,
  style,
  hideTitle = false,
  variant = "card",
}: NetworkGrowSummaryCardProps) {
  const { t } = useLanguage();
  const invitePct = Math.min(
    100,
    Math.round((todayInviteCount / dailyInviteLimit) * 100),
  );
  const statsLine = interpolate(t("networkGrowSummaryStats"), {
    discover: discoverCount,
    connected: totalConnections,
  });

  return (
    <View
      style={[
        variant === "card" ? styles.card : styles.inlineSection,
        style,
      ]}
    >
      {variant === "card" ? (
        <View
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={styles.watermarkWrap}
        >
          <LottieView
            source={require("@/assets/Animated folder/user-flow.json")}
            autoPlay
            loop
            speed={0.9}
            style={styles.watermark}
          />
        </View>
      ) : null}

      {hideTitle ? (
        <View style={styles.statsPill}>
          <Text style={styles.statsPillText}>{statsLine}</Text>
        </View>
      ) : (
        <>
          <View style={styles.head}>
            <View style={styles.iconWrap}>
              <LottieView
                source={require("@/assets/Animated folder/conversation-verified.json")}
                autoPlay
                loop
                speed={1}
                style={styles.headIconAnim}
              />
            </View>
            <Text style={styles.title}>{t("networkDiscoverGrowSlots")}</Text>
          </View>
          <Text style={styles.sub}>{statsLine}</Text>
        </>
      )}
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${invitePct}%` }]} />
      </View>
      <Text style={styles.meta}>
        {interpolate(t("networkGrowSummaryInvitesToday"), {
          count: todayInviteCount,
          limit: dailyInviteLimit,
        })}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: 0,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(79, 70, 229, 0.12)",
    backgroundColor: "rgba(79, 70, 229, 0.04)",
    padding: 18,
    gap: 10,
    position: "relative",
    overflow: "hidden",
    ...Platform.select({
      web: {
        boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
      },
      default: {
        shadowColor: "#0f172a",
        shadowOpacity: 0.04,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 1 },
        elevation: 1,
      },
    }),
  },
  inlineSection: {
    width: "100%",
    minWidth: 0,
    flexGrow: 0,
    flexShrink: 0,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
    gap: 10,
    backgroundColor: "transparent",
  },
  watermarkWrap: {
    position: "absolute",
    right: -10,
    top: -14,
    width: 152,
    height: 120,
    opacity: 0.17,
  },
  watermark: {
    width: "100%",
    height: "100%",
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minWidth: 0,
  },
  iconWrap: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },
  headIconAnim: {
    width: 26,
    height: 26,
  },
  title: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    fontWeight: "500",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.15,
  },
  sub: {
    fontSize: 12,
    fontWeight: "400",
    color: Theme.textSecondary,
    lineHeight: 17,
  },
  statsPill: {
    alignSelf: "flex-start",
    maxWidth: "100%",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: "rgba(99, 102, 241, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(99, 102, 241, 0.14)",
  },
  statsPillText: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.primary,
    lineHeight: 16,
  },
  progressTrack: {
    height: 5,
    borderRadius: 3,
    backgroundColor: "rgba(76, 87, 125, 0.1)",
    overflow: "hidden",
    marginTop: 2,
  },
  progressFill: {
    height: "100%",
    borderRadius: 3,
    backgroundColor: Theme.buttonPrimary,
  },
  meta: {
    fontSize: 11,
    fontWeight: "500",
    color: Theme.textSecondary,
  },
});
