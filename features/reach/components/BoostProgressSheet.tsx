/**
 * Boost progress — shown in-place when tapping the Boost pill on a story you
 * own, instead of navigating away to the full Reach History list.
 * "View all Reach campaigns" is the one link out to the full list.
 */
import Theme from "@/constants/Theme";
import {
  StoryFlowSheetPortal,
  useStoryPhoneFrameMetrics,
} from "@/features/network/components/StoryMobilePopupShell";
import { CampaignUpgradePanel } from "@/features/reach/components/CampaignUpgradePanel";
import { ReachMetricsGrid } from "@/features/reach/components/ReachMetricsGrid";
import { formatRemaining } from "@/features/reach/utils/campaignFormat";
import { formatINR, formatLedgerDateTime } from "@/lib/format";
import { useReachCampaignMetricsQuery, useReachCampaignsQuery, useReachPlansQuery } from "@/lib/queries/useReachCampaignsQuery";
import { getReachPlanDisplay } from "@/lib/reachPlanRegistry";
import { ROUTES } from "@/lib/routes";
import { useRouter } from "expo-router";
import { ChevronRight, Rocket, X } from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const MUTED = Theme.loadStatusTabTextMuted;

type CampaignStatus = "draft" | "active" | "completed" | "cancelled";

/** Emoji dots rendered at inconsistent sizes per platform — use a drawn dot. */
const STATUS_VISUAL: Record<CampaignStatus, { tone: string; label: string }> = {
  draft: { tone: Theme.textMuted, label: "Draft" },
  active: { tone: Theme.success, label: "Active" },
  completed: { tone: Theme.accentBrown, label: "Completed" },
  cancelled: { tone: Theme.textMuted, label: "Cancelled" },
};

function StatusDot({ tone }: { tone: string }) {
  return (
    <View style={[styles.statusDotRing, { borderColor: `${tone}33` }]}>
      <View style={[styles.statusDotCore, { backgroundColor: tone }]} />
    </View>
  );
}

interface BoostProgressSheetProps {
  visible: boolean;
  onClose: () => void;
  orgId: string;
  campaignId: string;
  onBoostAgain?: () => void;
}

export function BoostProgressSheet({ visible, onClose, orgId, campaignId, onBoostAgain }: BoostProgressSheetProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { phonePopup, sheetBottomPad } = useStoryPhoneFrameMetrics();
  const campaignsQ = useReachCampaignsQuery(visible ? orgId : null);
  const plansQ = useReachPlansQuery();
  const metricsQ = useReachCampaignMetricsQuery(visible ? campaignId : null);

  const campaign = campaignsQ.data?.find((c) => c.id === campaignId);
  const plan = plansQ.data?.find((p) => p.id === campaign?.plan_id);
  const display = plan ? getReachPlanDisplay(plan.code) : undefined;
  const statusVisual = campaign ? STATUS_VISUAL[campaign.status] : null;
  const metrics = metricsQ.data;

  const isActive = campaign?.status === "active";
  const isCompleted = campaign?.status === "completed" || campaign?.status === "cancelled";
  const isDraft = campaign?.status === "draft";
  const isFresh = metrics && metrics.impressions === 0 && metrics.views === 0;
  const bottomPad = sheetBottomPad ?? insets.bottom + 14;

  return (
    <StoryFlowSheetPortal
      visible={visible}
      onClose={onClose}
      accessibilityLabel="Close boost progress"
    >
      <View style={[styles.sheet, phonePopup && styles.sheetPhone, { paddingBottom: bottomPad }]}>
          <View style={styles.handle} />

          <View style={styles.header}>
            <View style={styles.headerLeading}>
              <View style={styles.headerIcon}>
                <Rocket
                  size={12}
                  color={display?.color ?? Theme.accentBrown}
                  strokeWidth={2.25}
                />
              </View>
              <View style={styles.headerCopy}>
                <Text style={styles.title} numberOfLines={1}>
                  {isCompleted ? "Campaign finished" : plan ? `${plan.name} Plan` : "Boost progress"}
                </Text>
                {plan ? (
                  <Text style={styles.subtitle}>
                    {formatINR(plan.price_inr)}
                  </Text>
                ) : null}
              </View>
            </View>
            <Pressable style={styles.closeBtn} onPress={onClose} hitSlop={8} accessibilityRole="button">
              <X size={13} color={MUTED} strokeWidth={2.25} />
            </Pressable>
          </View>

          {statusVisual ? (
            <View style={styles.statusRow}>
              <StatusDot tone={statusVisual.tone} />
              <View style={styles.statusTextCol}>
                <Text style={styles.statusLabel}>{statusVisual.label}</Text>
                <Text style={styles.statusSublabel}>
                  {isCompleted
                    ? "This campaign has ended."
                    : isDraft
                      ? "Awaiting payment confirmation — not live yet."
                      : isFresh
                        ? "Just started — promoting your load now."
                        : "Promoting your load across Pulse"}
                </Text>
              </View>
            </View>
          ) : null}

          <View style={styles.divider} />

          <View style={styles.metricsCard}>
            <ReachMetricsGrid campaignId={campaignId} />
          </View>

          {plan && metrics ? (
            <View style={styles.progressBlock}>
              <View style={styles.progressLabelRow}>
                <Text style={styles.progressLabel}>Campaign Reach</Text>
                <Text style={styles.progressValue}>
                  {Math.min(metrics.impressions, plan.estimated_reach_max)}
                  <Text style={styles.progressValueTotal}>
                    {" / "}
                    {plan.estimated_reach_max}
                  </Text>
                </Text>
              </View>
              <View style={styles.progressTrack}>
                <View
                  style={[
                    styles.progressFill,
                    {
                      width: `${Math.min(100, (metrics.impressions / plan.estimated_reach_max) * 100)}%`,
                      backgroundColor: display?.color ?? Theme.accentBrown,
                    },
                  ]}
                />
              </View>
            </View>
          ) : null}

          {isActive && campaign ? (
            <View style={styles.timelineCard}>
              <View style={styles.timelineCell}>
                <Text style={styles.timelineLabel}>Started</Text>
                <Text style={styles.timelineValue}>{formatLedgerDateTime(campaign.published_at)}</Text>
              </View>
              <View style={styles.timelineSplit} />
              <View style={styles.timelineCell}>
                <Text style={styles.timelineLabel}>Expires</Text>
                <Text style={styles.timelineValue}>{formatLedgerDateTime(campaign.expires_at)}</Text>
              </View>
              <View style={styles.timelineSplit} />
              <View style={styles.timelineCell}>
                <Text style={styles.timelineLabel}>Remaining</Text>
                <Text style={[styles.timelineValue, styles.timelineValueAccent]}>
                  {formatRemaining(campaign.expires_at)}
                </Text>
              </View>
            </View>
          ) : null}

          {isActive && campaign ? (
            <CampaignUpgradePanel orgId={orgId} campaignId={campaignId} currentPlanId={campaign.plan_id} />
          ) : null}

          {isCompleted && onBoostAgain ? (
            <Pressable
              style={styles.boostAgainBtn}
              onPress={() => {
                onClose();
                onBoostAgain();
              }}
            >
              <Rocket size={12} color={Theme.accentBrown} />
              <Text style={styles.boostAgainBtnText}>Boost again</Text>
            </Pressable>
          ) : null}

          <View style={styles.divider} />

          <View style={styles.linkList}>
            <Pressable
              style={({ pressed }) => [styles.linkRow, pressed && styles.linkRowPressed]}
              onPress={() => {
                onClose();
                router.push(ROUTES.REACH.campaignDetail(campaignId) as never);
              }}
            >
              <Text style={[styles.linkText, styles.linkTextPrimary]}>
                View full campaign
              </Text>
              <ChevronRight size={12} color={Theme.accentBrown} />
            </Pressable>

            <View style={styles.divider} />

            <Pressable
              style={({ pressed }) => [styles.linkRow, pressed && styles.linkRowPressed]}
              onPress={() => {
                onClose();
                router.push(ROUTES.REACH.HISTORY as never);
              }}
            >
              <Text style={styles.linkText}>View all Reach campaigns</Text>
              <ChevronRight size={12} color={Theme.textMuted} />
            </Pressable>
          </View>
      </View>
    </StoryFlowSheetPortal>
  );
}

const styles = StyleSheet.create({
  sheet: {
    backgroundColor: Theme.cardWhite,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 14,
    paddingTop: 8,
    gap: 8,
  },
  sheetPhone: {
    width: "100%",
    maxHeight: "88%",
  },
  handle: {
    width: 28,
    height: 3,
    borderRadius: 2,
    backgroundColor: Theme.borderMedium,
    alignSelf: "center",
    marginBottom: 2,
  },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headerLeading: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1, minWidth: 0 },
  headerIcon: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: Theme.accentBrownWash,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.accentBrownBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCopy: { flex: 1, minWidth: 0 },
  title: {
    fontSize: 13,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.2,
  },
  subtitle: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.accentBrown,
    letterSpacing: 0.2,
    marginTop: 1,
  },
  closeBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: Theme.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  statusDotRing: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2.5,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  statusDotCore: { width: 7, height: 7, borderRadius: 4 },
  statusTextCol: { flex: 1, minWidth: 0 },
  statusLabel: {
    fontSize: 11.5,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.1,
  },
  statusSublabel: { fontSize: 10, fontWeight: "500", color: MUTED, marginTop: 1 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: Theme.borderLight },
  metricsCard: {
    // White so the grid's own `Theme.surface` cells read as separate tiles —
    // surface-on-surface made the four metrics blur into one grey block.
    backgroundColor: Theme.cardWhite,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    padding: 9,
  },
  progressBlock: { gap: 5 },
  progressLabelRow: { flexDirection: "row", justifyContent: "space-between" },
  progressLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: MUTED,
    letterSpacing: 0.2,
  },
  progressValue: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.accentBrown,
    fontVariant: ["tabular-nums"],
  },
  progressValueTotal: { color: MUTED, fontWeight: "700" },
  progressTrack: {
    height: 5,
    borderRadius: 3,
    backgroundColor: Theme.accentBrownSoft,
    overflow: "hidden",
  },
  progressFill: { height: "100%", borderRadius: 3 },
  timelineCard: {
    flexDirection: "row",
    alignItems: "stretch",
    borderRadius: 11,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surface,
    paddingVertical: 8,
  },
  timelineCell: {
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
    minWidth: 0,
    gap: 2,
    paddingHorizontal: 4,
  },
  timelineSplit: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: Theme.borderLight,
    marginVertical: 2,
  },
  timelineLabel: {
    fontSize: 8,
    fontWeight: "800",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  timelineValue: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    textAlign: "center",
  },
  timelineValueAccent: { color: Theme.accentBrown, fontWeight: "800" },
  boostAgainBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minHeight: 36,
    borderRadius: 11,
    backgroundColor: Theme.accentBrownWash,
    borderWidth: 1,
    borderColor: Theme.accentBrownBorder,
  },
  boostAgainBtnText: { fontSize: 11, fontWeight: "800", color: Theme.accentBrown },
  linkList: { marginTop: -2 },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 9,
  },
  linkRowPressed: { opacity: 0.6 },
  linkText: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textMuted,
    letterSpacing: 0.1,
  },
  linkTextPrimary: { color: Theme.accentBrown, fontWeight: "800" },
});
