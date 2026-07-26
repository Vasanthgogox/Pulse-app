/**
 * Campaign Health & Diagnostics — the "is this campaign working?" panel:
 * circular health index, per-factor diagnostic checklist (Fleet Reach /
 * Driver Reach / Opportunity Conversion) with rating badges, remaining reward
 * budget, and rules-based Smart Suggestions. All computed client-side by
 * computeCampaignHealth; suggestions are informational (no fake actions).
 */
import Theme from "@/constants/Theme";
import type {
  ReachCampaignRow,
  ReachPlanRow,
} from "@/features/reach/services/campaigns.service";
import type { ReachDriverReferralRow } from "@/features/reach/services/driverReferrals.service";
import type { ReachCampaignMetrics } from "@/features/reach/services/analytics.service";
import {
  computeCampaignHealth,
  HEALTH_RATING_LABELS,
  type HealthRating,
} from "@/features/reach/utils/campaignHealth";
import { Activity, Eye, GitPullRequest, Lightbulb, Users, Wallet } from "lucide-react-native";
import { useMemo } from "react";
import { Platform, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import Svg, { Circle } from "react-native-svg";

const RING_SIZE = 96;
const RING_STROKE = 8;
const RING_R = (RING_SIZE - RING_STROKE) / 2;
const RING_C = 2 * Math.PI * RING_R;

function ratingColor(rating: HealthRating): string {
  switch (rating) {
    case "excellent":
      return Theme.success;
    case "good":
      return Theme.primary;
    case "fair":
      return Theme.accentBrown;
    case "poor":
      return Theme.negative;
    default:
      return Theme.textMuted;
  }
}

function ratingBadgeBg(rating: HealthRating): string {
  switch (rating) {
    case "excellent":
      return Theme.positiveMuted;
    case "good":
      return Theme.primary + "14";
    case "fair":
      return Theme.accentBrownMuted;
    case "poor":
      return Theme.negativeMuted;
    default:
      return Theme.surfaceGray;
  }
}

function verdictColors(verdict: string): { text: string; bg: string; border: string } {
  if (verdict === "Healthy") {
    return {
      text: Theme.success,
      bg: Theme.positiveMuted,
      border: Theme.networkHubListCardConnectedBorder,
    };
  }
  if (verdict === "Fair") {
    return { text: Theme.accentBrownDeep, bg: Theme.accentBrownMuted, border: Theme.accentBrownBorder };
  }
  return { text: Theme.negative, bg: Theme.negativeMuted, border: Theme.borderInput };
}

const FACTOR_ICONS = {
  fleet_reach: Eye,
  driver_reach: Users,
  conversion: GitPullRequest,
} as const;

interface ReachCampaignHealthCardProps {
  campaign: ReachCampaignRow;
  plan?: ReachPlanRow;
  metrics?: ReachCampaignMetrics | null;
  referrals: ReachDriverReferralRow[];
}

export function ReachCampaignHealthCard({
  campaign,
  plan,
  metrics,
  referrals,
}: ReachCampaignHealthCardProps) {
  const { width } = useWindowDimensions();
  const isWide = Platform.OS === "web" && width >= 768;
  const health = useMemo(
    () => computeCampaignHealth({ campaign, plan, metrics, referrals }),
    [campaign, plan, metrics, referrals],
  );
  const verdict = verdictColors(health.verdict);
  const ringColor =
    health.score >= 75 ? Theme.success : health.score >= 50 ? Theme.accentBrown : Theme.negative;
  const ringOffset = RING_C - (RING_C * health.score) / 100;
  const ringHint =
    health.verdict === "Healthy"
      ? "Campaign performing within target range"
      : health.verdict === "Fair"
        ? "Some factors are behind target"
        : "Reach is below target range";

  return (
    <View style={styles.card}>
      {/* Header */}
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <View style={styles.headerIcon}>
            <Activity size={14} color={Theme.accentBrown} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.headerLabel}>Campaign Health &amp; Diagnostics</Text>
            <Text style={styles.headerSub}>
              Real-time optimization checklist and performance alerts
            </Text>
          </View>
        </View>
        <View style={[styles.verdictPill, { backgroundColor: verdict.bg, borderColor: verdict.border }]}>
          <View style={[styles.verdictDot, { backgroundColor: verdict.text }]} />
          <Text style={[styles.verdictText, { color: verdict.text }]}>{health.verdict}</Text>
        </View>
      </View>

      {/* Score ring + diagnostics */}
      <View style={[styles.bodyGrid, isWide && styles.bodyGridWide]}>
        <View style={[styles.ringBox, isWide && styles.ringBoxWide]}>
          <View style={styles.ringWrap}>
            <Svg width={RING_SIZE} height={RING_SIZE}>
              <Circle
                cx={RING_SIZE / 2}
                cy={RING_SIZE / 2}
                r={RING_R}
                stroke={Theme.surfaceGray}
                strokeWidth={RING_STROKE}
                fill="transparent"
              />
              <Circle
                cx={RING_SIZE / 2}
                cy={RING_SIZE / 2}
                r={RING_R}
                stroke={ringColor}
                strokeWidth={RING_STROKE}
                strokeLinecap="round"
                fill="transparent"
                strokeDasharray={`${RING_C}`}
                strokeDashoffset={ringOffset}
                transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
              />
            </Svg>
            <View style={styles.ringCenter}>
              <Text style={styles.ringScore}>{health.score}%</Text>
              <Text style={styles.ringCaption}>Health Index</Text>
            </View>
          </View>
          <Text style={styles.ringHint}>{ringHint}</Text>
        </View>

        <View style={styles.factorList}>
          {health.factors.map((f) => {
            const Icon = FACTOR_ICONS[f.key];
            const color = ratingColor(f.rating);
            return (
              <View key={f.key} style={styles.factorRow}>
                <View style={[styles.factorIcon, { backgroundColor: ratingBadgeBg(f.rating) }]}>
                  <Icon size={13} color={color} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.factorLabel}>{f.label}</Text>
                  <Text style={styles.factorDetail} numberOfLines={2}>{f.detail}</Text>
                </View>
                <View style={[styles.ratingBadge, { backgroundColor: ratingBadgeBg(f.rating) }]}>
                  <Text style={[styles.ratingBadgeText, { color }]}>
                    {HEALTH_RATING_LABELS[f.rating]}
                  </Text>
                </View>
              </View>
            );
          })}

          {health.remainingRewardBudget != null ? (
            <View style={styles.factorRow}>
              <View style={[styles.factorIcon, { backgroundColor: Theme.accentBrownMuted }]}>
                <Wallet size={13} color={Theme.accentBrown} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.factorLabel}>Remaining Reward Budget</Text>
                <Text style={styles.factorDetail}>Refunds automatically if unused</Text>
              </View>
              <Text style={styles.budgetValue}>
                {health.remainingRewardBudget.toLocaleString()} credits
              </Text>
            </View>
          ) : null}
        </View>
      </View>

      {/* Smart Suggestions */}
      {health.suggestions.map((s) => (
        <View key={s.id} style={styles.suggestionBanner}>
          <View style={styles.suggestionIcon}>
            <Lightbulb size={14} color={Theme.textOnPrimary} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.suggestionTitle}>Smart Suggestion: {s.title}</Text>
            <Text style={styles.suggestionBody}>{s.body}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 10,
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    padding: 16,
    gap: 14,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderInput,
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 9, flex: 1, minWidth: 0 },
  headerIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: Theme.accentBrownMuted,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  headerLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.1,
  },
  headerSub: { fontSize: 11, fontWeight: "500", color: Theme.textMuted, marginTop: 2 },
  verdictPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    flexShrink: 0,
  },
  verdictDot: { width: 6, height: 6, borderRadius: 3 },
  verdictText: { fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.3 },

  bodyGrid: { gap: 12 },
  bodyGridWide: { flexDirection: "row", alignItems: "center", gap: 16 },
  ringBox: {
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: Theme.surfaceGray,
    borderWidth: 1,
    borderColor: Theme.borderInput,
  },
  ringBoxWide: { minWidth: 160, alignSelf: "stretch" },
  ringWrap: { width: RING_SIZE, height: RING_SIZE, alignItems: "center", justifyContent: "center" },
  ringCenter: {
    position: "absolute",
    inset: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  ringScore: {
    fontSize: 20,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    fontVariant: ["tabular-nums"],
    letterSpacing: -0.5,
  },
  ringCaption: {
    fontSize: 8,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 2,
  },
  ringHint: { fontSize: 10, fontWeight: "500", color: Theme.textSecondary, textAlign: "center" },

  factorList: { flex: 1, minWidth: 0, gap: 8 },
  factorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: Theme.surfaceGray,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  factorIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  factorLabel: { fontSize: 12, fontWeight: "700", color: Theme.textPrimaryDark },
  factorDetail: { fontSize: 10, fontWeight: "500", color: Theme.textMuted, marginTop: 2 },
  ratingBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    flexShrink: 0,
  },
  ratingBadgeText: { fontSize: 9, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.3 },
  budgetValue: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    fontVariant: ["tabular-nums"],
    flexShrink: 0,
  },

  suggestionBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    borderRadius: 8,
    backgroundColor: Theme.accentBrownWash,
    borderWidth: 1,
    borderColor: Theme.accentBrownBorder,
    padding: 12,
  },
  suggestionIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: Theme.accentBrown,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  suggestionTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.accentBrownDeep,
    letterSpacing: -0.1,
  },
  suggestionBody: {
    fontSize: 11,
    fontWeight: "500",
    color: Theme.textSecondary,
    lineHeight: 15,
    marginTop: 2,
  },
});
