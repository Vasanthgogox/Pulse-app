/**
 * Grow your network — discovery stats + daily invite progress (pairs with Invite via Link).
 */
import Theme from "@/constants/Theme";
import { DAILY_CONNECTION_INVITE_LIMIT } from "@/features/connections/services/connectionRequests.service";
import { useLanguage } from "@/contexts/LanguageContext";
import { Sparkles } from "lucide-react-native";
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
};

export function NetworkGrowSummaryCard({
  discoverCount,
  totalConnections,
  todayInviteCount,
  dailyInviteLimit = DAILY_CONNECTION_INVITE_LIMIT,
  style,
}: NetworkGrowSummaryCardProps) {
  const { t } = useLanguage();
  const invitePct = Math.min(
    100,
    Math.round((todayInviteCount / dailyInviteLimit) * 100),
  );

  return (
    <View style={[styles.card, style]}>
      <View style={styles.head}>
        <View style={styles.iconWrap}>
          <Sparkles size={13} color={Theme.primary} strokeWidth={2.1} />
        </View>
        <Text style={styles.title}>{t("networkDiscoverGrowSlots")}</Text>
      </View>
      <Text style={styles.sub}>
        {interpolate(t("networkGrowSummaryStats"), {
          discover: discoverCount,
          connected: totalConnections,
        })}
      </Text>
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
    gap: 8,
    justifyContent: "center",
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
  head: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minWidth: 0,
  },
  iconWrap: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(99, 102, 241, 0.09)",
    borderWidth: 1,
    borderColor: "rgba(99, 102, 241, 0.14)",
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
    backgroundColor: Theme.primary,
  },
  meta: {
    fontSize: 11,
    fontWeight: "500",
    color: Theme.textSecondary,
  },
});
