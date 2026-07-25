/**
 * Boost progress — shown in-place when tapping the Boost pill on a story you
 * own, instead of navigating away to the full Reach History list.
 * "View all Reach campaigns" is the one link out to the full list.
 */
import Theme from "@/constants/Theme";
import { formatINR, formatLedgerDateTime } from "@/lib/format";
import {
  useReachCampaignsQuery,
  useReachPlansQuery,
  useUpgradeReachCampaignMutation,
} from "@/lib/queries/useReachCampaignsQuery";
import { ReachMetricsGrid } from "@/features/reach/components/ReachMetricsGrid";
import { useReachCampaignMetricsQuery } from "@/lib/queries/useReachCampaignsQuery";
import { getReachPlanDisplay } from "@/lib/reachPlanRegistry";
import { ROUTES } from "@/lib/routes";
import { useRouter } from "expo-router";
import { ChevronRight, Coins, CreditCard, Rocket, X } from "lucide-react-native";
import { useState } from "react";
import { ActivityIndicator, Alert, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const INK = Theme.loadAddButtonText;
const MUTED = Theme.loadStatusTabTextMuted;

type CampaignStatus = "draft" | "active" | "completed" | "cancelled";

const STATUS_VISUAL: Record<CampaignStatus, { dot: string; label: string }> = {
  draft: { dot: "⚪", label: "Draft" },
  active: { dot: "🟢", label: "Active" },
  completed: { dot: "🔵", label: "Completed" },
  cancelled: { dot: "🔵", label: "Cancelled" },
};

function formatRemaining(expiresAt: string | null): string {
  if (!expiresAt) return "—";
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return "Ending soon";
  const hours = Math.floor(ms / (60 * 60 * 1000));
  if (hours < 1) return "< 1h";
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
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
  const campaignsQ = useReachCampaignsQuery(visible ? orgId : null);
  const plansQ = useReachPlansQuery();
  const metricsQ = useReachCampaignMetricsQuery(visible ? campaignId : null);
  const upgradeMutation = useUpgradeReachCampaignMutation();

  const [showUpgrade, setShowUpgrade] = useState(false);
  const [upgradePaymentMethod, setUpgradePaymentMethod] = useState<"credits" | "money">("credits");

  const campaign = campaignsQ.data?.find((c) => c.id === campaignId);
  const plan = plansQ.data?.find((p) => p.id === campaign?.plan_id);
  const display = plan ? getReachPlanDisplay(plan.code) : undefined;
  const statusVisual = campaign ? STATUS_VISUAL[campaign.status] : null;
  const metrics = metricsQ.data;

  const nextPlan = plan
    ? plansQ.data?.filter((p) => p.sort_order > plan.sort_order).sort((a, b) => a.sort_order - b.sort_order)[0]
    : undefined;
  const upgradeDiffCredits = nextPlan && plan ? nextPlan.credit_price - plan.credit_price : 0;
  const upgradeDiffInr = nextPlan && plan ? nextPlan.price_inr - plan.price_inr : 0;

  const isActive = campaign?.status === "active";
  const isCompleted = campaign?.status === "completed" || campaign?.status === "cancelled";
  const isDraft = campaign?.status === "draft";
  const isFresh = metrics && metrics.impressions === 0 && metrics.views === 0;

  const handleUpgrade = async () => {
    if (!nextPlan) return;
    const { error } = await upgradeMutation.mutateAsync({
      campaignId,
      newPlanId: nextPlan.id,
      paymentMethod: upgradePaymentMethod,
      orgId,
    });
    if (error) {
      Alert.alert("Couldn't upgrade", error.message);
      return;
    }
    setShowUpgrade(false);
    Alert.alert("Upgraded", `This campaign is now on the ${nextPlan.name} plan.`);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close boost progress" />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 14 }]}>
          <View style={styles.handle} />

          <View style={styles.header}>
            <View style={styles.headerLeading}>
              <View style={styles.headerIcon}>
                <Rocket size={15} color={display?.color ?? INK} strokeWidth={2.25} />
              </View>
              <View>
                <Text style={styles.title}>
                  {isCompleted ? "Campaign finished" : plan ? `${plan.name} Plan` : "Boost progress"}
                </Text>
                {plan ? <Text style={styles.subtitle}>{formatINR(plan.price_inr)}</Text> : null}
              </View>
            </View>
            <Pressable style={styles.closeBtn} onPress={onClose} hitSlop={8} accessibilityRole="button">
              <X size={16} color={MUTED} strokeWidth={2.25} />
            </Pressable>
          </View>

          {statusVisual ? (
            <View style={styles.statusRow}>
              <Text style={styles.statusDot}>{statusVisual.dot}</Text>
              <View style={styles.statusTextCol}>
                <Text style={styles.statusLabel}>
                  {isCompleted && metrics ? `Reached ${metrics.impressions} fleet owners` : statusVisual.label}
                </Text>
                <Text style={styles.statusSublabel}>
                  {isCompleted
                    ? "This campaign has ended."
                    : isDraft
                      ? "Awaiting payment confirmation — not live yet."
                      : isFresh
                        ? "Reach just started — we're delivering your load now."
                        : "Reaching verified fleet owners"}
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
                <Text style={styles.progressLabel}>Reach delivered</Text>
                <Text style={styles.progressValue}>
                  {Math.min(metrics.impressions, plan.estimated_reach_max)} / {plan.estimated_reach_max}
                </Text>
              </View>
              <View style={styles.progressTrack}>
                <View
                  style={[
                    styles.progressFill,
                    {
                      width: `${Math.min(100, (metrics.impressions / plan.estimated_reach_max) * 100)}%`,
                      backgroundColor: display?.color ?? Theme.primary,
                    },
                  ]}
                />
              </View>
            </View>
          ) : null}

          <View style={styles.divider} />

          {isActive && campaign ? (
            <View style={styles.timelineRow}>
              <View style={styles.timelineCell}>
                <Text style={styles.timelineLabel}>Started</Text>
                <Text style={styles.timelineValue}>{formatLedgerDateTime(campaign.published_at)}</Text>
              </View>
              <View style={styles.timelineCell}>
                <Text style={styles.timelineLabel}>Expires</Text>
                <Text style={styles.timelineValue}>{formatLedgerDateTime(campaign.expires_at)}</Text>
              </View>
              <View style={styles.timelineCell}>
                <Text style={styles.timelineLabel}>Remaining</Text>
                <Text style={styles.timelineValue}>{formatRemaining(campaign.expires_at)}</Text>
              </View>
            </View>
          ) : null}

          {isActive && nextPlan ? (
            showUpgrade ? (
              <View style={styles.upgradeCard}>
                <Text style={styles.upgradeCardTitle}>
                  Upgrade to {nextPlan.name} — only {upgradePaymentMethod === "credits" ? `${upgradeDiffCredits} credits` : formatINR(upgradeDiffInr)} more
                </Text>
                <View style={styles.paymentRow}>
                  <Pressable
                    style={[styles.paymentBtn, upgradePaymentMethod === "credits" && styles.paymentBtnActive]}
                    onPress={() => setUpgradePaymentMethod("credits")}
                  >
                    <Coins size={13} color={upgradePaymentMethod === "credits" ? INK : MUTED} />
                    <Text style={[styles.paymentBtnText, upgradePaymentMethod === "credits" && styles.paymentBtnTextActive]}>
                      Credits
                    </Text>
                  </Pressable>
                  <Pressable
                    style={[styles.paymentBtn, upgradePaymentMethod === "money" && styles.paymentBtnActive]}
                    onPress={() => setUpgradePaymentMethod("money")}
                  >
                    <CreditCard size={13} color={upgradePaymentMethod === "money" ? INK : MUTED} />
                    <Text style={[styles.paymentBtnText, upgradePaymentMethod === "money" && styles.paymentBtnTextActive]}>
                      Cash
                    </Text>
                  </Pressable>
                </View>
                <Pressable style={styles.upgradeConfirmBtn} disabled={upgradeMutation.isPending} onPress={handleUpgrade}>
                  {upgradeMutation.isPending ? (
                    <ActivityIndicator size="small" color={INK} />
                  ) : (
                    <Text style={styles.upgradeConfirmBtnText}>Confirm upgrade</Text>
                  )}
                </Pressable>
              </View>
            ) : (
              <Pressable style={styles.upgradeRow} onPress={() => setShowUpgrade(true)}>
                <Text style={styles.upgradeRowText}>
                  Upgrade to {nextPlan.name} — only {upgradeDiffCredits} credits more
                </Text>
                <ChevronRight size={13} color={Theme.textMuted} />
              </Pressable>
            )
          ) : null}

          {isCompleted && onBoostAgain ? (
            <Pressable
              style={styles.boostAgainBtn}
              onPress={() => {
                onClose();
                onBoostAgain();
              }}
            >
              <Rocket size={14} color={INK} />
              <Text style={styles.boostAgainBtnText}>Boost again</Text>
            </Pressable>
          ) : null}

          <View style={styles.divider} />

          <Pressable
            style={styles.viewAllRow}
            onPress={() => {
              onClose();
              router.push(ROUTES.REACH.HISTORY as never);
            }}
          >
            <Text style={styles.viewAllText}>View all Reach campaigns</Text>
            <ChevronRight size={14} color={Theme.textMuted} />
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "flex-end", backgroundColor: Theme.overlayBackdrop },
  sheet: {
    backgroundColor: Theme.cardWhite,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 18,
    paddingTop: 10,
    gap: 12,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Theme.borderMedium,
    alignSelf: "center",
    marginBottom: 4,
  },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headerLeading: { flexDirection: "row", alignItems: "center", gap: 10 },
  headerIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: Theme.accentGoldMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: 15, fontWeight: "800", color: Theme.textPrimaryDark },
  subtitle: { fontSize: 11, fontWeight: "600", color: MUTED, marginTop: 1 },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: Theme.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  statusDot: { fontSize: 14 },
  statusTextCol: { flex: 1 },
  statusLabel: { fontSize: 13, fontWeight: "800", color: Theme.textPrimaryDark },
  statusSublabel: { fontSize: 11, fontWeight: "500", color: MUTED, marginTop: 1 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: Theme.borderLight },
  metricsCard: {
    backgroundColor: Theme.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    padding: 14,
  },
  progressBlock: { gap: 6 },
  progressLabelRow: { flexDirection: "row", justifyContent: "space-between" },
  progressLabel: { fontSize: 11, fontWeight: "700", color: MUTED },
  progressValue: { fontSize: 11, fontWeight: "800", color: Theme.textPrimaryDark },
  progressTrack: { height: 6, borderRadius: 3, backgroundColor: Theme.surface, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 3 },
  timelineRow: { flexDirection: "row", justifyContent: "space-between" },
  timelineCell: { alignItems: "center", flex: 1, gap: 2 },
  timelineLabel: { fontSize: 9, fontWeight: "700", color: Theme.textMuted, textTransform: "uppercase" },
  timelineValue: { fontSize: 11, fontWeight: "700", color: Theme.textPrimaryDark, textAlign: "center" },
  upgradeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: Theme.accentGoldMuted,
  },
  upgradeRowText: { fontSize: 12, fontWeight: "700", color: Theme.textPrimaryDark, flexShrink: 1 },
  upgradeCard: { borderRadius: 14, borderWidth: 1, borderColor: Theme.borderLight, padding: 12, gap: 10 },
  upgradeCardTitle: { fontSize: 12, fontWeight: "700", color: Theme.textPrimaryDark },
  paymentRow: { flexDirection: "row", gap: 8 },
  paymentBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  paymentBtnActive: { backgroundColor: Theme.loadAddButtonBg, borderColor: Theme.loadStatusTabBorderSoft },
  paymentBtnText: { fontSize: 11, fontWeight: "700", color: MUTED },
  paymentBtnTextActive: { color: INK },
  upgradeConfirmBtn: {
    minHeight: 42,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.loadAddButtonBg,
  },
  upgradeConfirmBtnText: { fontSize: 12, fontWeight: "800", color: INK },
  boostAgainBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 46,
    borderRadius: 14,
    backgroundColor: Theme.loadAddButtonBg,
    borderWidth: Theme.buttonPrimaryBorderWidth,
    borderColor: Theme.buttonPrimaryBorder,
  },
  boostAgainBtnText: { fontSize: 12, fontWeight: "800", color: INK },
  viewAllRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 12,
  },
  viewAllText: { fontSize: 12, fontWeight: "700", color: Theme.textMuted },
});
