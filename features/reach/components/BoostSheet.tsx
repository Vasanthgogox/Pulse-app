/**
 * Boost sheet — pick a Reach plan, pay with Pulse Credits or cash, publish.
 * Modeled on StoryOwnerBidsSheet.tsx's Modal/sheet pattern.
 */
import Theme from "@/constants/Theme";
import { formatINR } from "@/lib/format";
import { useReachPlansQuery, usePublishReachCampaignMutation } from "@/lib/queries/useReachCampaignsQuery";
import { useReachWalletQuery } from "@/lib/queries/useReachWalletQuery";
import { describeReachPlan, getReachPlanDisplay } from "@/lib/reachPlanRegistry";
import type { ReachPlanRow } from "@/features/reach/services/campaigns.service";
import { Check, CheckCircle2, Coins, CreditCard, Rocket, X } from "lucide-react-native";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const INK = Theme.loadAddButtonText;
const MUTED = Theme.loadStatusTabTextMuted;

interface BoostSheetProps {
  visible: boolean;
  onClose: () => void;
  orgId: string;
  postId: string;
  /** Called with the new campaign's id — the post list hasn't refetched yet
   * at this point, so callers needing the id right away (View Campaign)
   * can't rely on post.reach_campaign_id being fresh. */
  onBoosted: (campaignId: string) => void;
  /** Opens the progress sheet for the campaign that was just created. */
  onViewCampaign?: () => void;
}

function formatDuration(hours: number): string {
  if (hours % 24 === 0) return `${hours / 24} day${hours === 24 ? "" : "s"}`;
  return `${hours} hours`;
}

export function BoostSheet({ visible, onClose, orgId, postId, onBoosted, onViewCampaign }: BoostSheetProps) {
  const insets = useSafeAreaInsets();
  const plansQ = useReachPlansQuery();
  const walletQ = useReachWalletQuery(visible ? orgId : null);
  const publishMutation = usePublishReachCampaignMutation();

  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"credits" | "money">("credits");
  const [justBoosted, setJustBoosted] = useState<{ plan: ReachPlanRow; pending: boolean } | null>(null);

  useEffect(() => {
    if (visible && plansQ.data && plansQ.data.length > 0 && !selectedPlanId) {
      setSelectedPlanId(plansQ.data[0].id);
    }
    if (!visible) {
      setSelectedPlanId(null);
      setPaymentMethod("credits");
      setJustBoosted(null);
    }
  }, [visible, plansQ.data, selectedPlanId]);

  const selectedPlan = plansQ.data?.find((p) => p.id === selectedPlanId) ?? null;
  const balance = walletQ.data ?? 0;
  const canAffordCredits = selectedPlan ? balance >= selectedPlan.credit_price : false;

  const handleConfirm = async () => {
    if (!selectedPlan) return;
    const { error, result } = await publishMutation.mutateAsync({
      orgId,
      postId,
      planId: selectedPlan.id,
      paymentMethod,
    });
    if (error || !result) {
      Alert.alert("Couldn't boost this load", error?.message ?? "Unknown error");
      return;
    }
    onBoosted(result.campaign_id);
    setJustBoosted({ plan: selectedPlan, pending: result.purchase_status === "pending" });
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close boost picker" />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 14 }]}>
          <View style={styles.handle} />

          {justBoosted ? (
            <View style={styles.successWrap}>
              <Text style={styles.successEmoji}>{justBoosted.pending ? "🕐" : "🎉"}</Text>
              <Text style={styles.successTitle}>
                {justBoosted.pending ? "Boost requested" : "Your load is now promoted!"}
              </Text>
              <View style={styles.successPlanBadge}>
                <Rocket size={12} color={getReachPlanDisplay(justBoosted.plan.code)?.color ?? Theme.primary} />
                <Text
                  style={[
                    styles.successPlanBadgeText,
                    { color: getReachPlanDisplay(justBoosted.plan.code)?.color ?? Theme.primary },
                  ]}
                >
                  {justBoosted.plan.name} Plan
                </Text>
              </View>
              {justBoosted.pending ? (
                <Text style={styles.successPending}>
                  Awaiting payment confirmation — your load will go live and be promoted to relevant fleet owners and shippers across Pulse once confirmed.
                </Text>
              ) : (
                <>
                  <Text style={styles.successBody}>
                    Promoting your load to relevant fleet owners and shippers across Pulse
                  </Text>
                  <Text style={styles.successStartNote}>Campaign starts immediately.</Text>
                </>
              )}
              <View style={styles.successActionRow}>
                {onViewCampaign ? (
                  <Pressable
                    style={styles.viewCampaignBtn}
                    onPress={() => {
                      onClose();
                      onViewCampaign();
                    }}
                  >
                    <Text style={styles.viewCampaignBtnText}>View Campaign</Text>
                  </Pressable>
                ) : null}
                <Pressable style={[styles.doneBtn, onViewCampaign && styles.doneBtnFlex]} onPress={onClose}>
                  <CheckCircle2 size={15} color={INK} strokeWidth={2.25} />
                  <Text style={styles.doneBtnText}>Done</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <>
          <View style={styles.header}>
            <View style={styles.headerLeading}>
              <View style={styles.headerIcon}>
                <Rocket size={15} color={INK} strokeWidth={2.25} />
              </View>
              <View>
                <Text style={styles.title}>Boost this load</Text>
                <Text style={styles.subtitle}>Reach more verified fleet owners</Text>
              </View>
            </View>
            <Pressable style={styles.closeBtn} onPress={onClose} hitSlop={8} accessibilityRole="button">
              <X size={16} color={MUTED} strokeWidth={2.25} />
            </Pressable>
          </View>

          {plansQ.isLoading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator color={INK} />
            </View>
          ) : plansQ.isError || (plansQ.data ?? []).length === 0 ? (
            <View style={styles.loadingWrap}>
              <Text style={styles.errorText}>
                {plansQ.isError
                  ? `Couldn't load Reach plans: ${(plansQ.error as Error)?.message ?? "unknown error"}`
                  : "No Reach plans are available for this workspace yet."}
              </Text>
            </View>
          ) : (
            <ScrollView style={styles.plansList} showsVerticalScrollIndicator={false}>
              {(plansQ.data ?? []).map((plan) => {
                const display = getReachPlanDisplay(plan.code);
                const active = plan.id === selectedPlanId;
                return (
                  <Pressable
                    key={plan.id}
                    style={[styles.planCard, active && styles.planCardActive]}
                    onPress={() => setSelectedPlanId(plan.id)}
                  >
                    <View style={styles.planCardTop}>
                      <Text style={styles.planName}>{plan.name}</Text>
                      {active ? <Check size={16} color={display?.color ?? Theme.primary} strokeWidth={3} /> : null}
                    </View>
                    <Text style={styles.planReach}>
                      {describeReachPlan(plan)} · runs {formatDuration(plan.duration_hours)}
                    </Text>
                    <View style={styles.planPriceRow}>
                      <Text style={styles.planPrice}>{formatINR(plan.price_inr)}</Text>
                      <Text style={styles.planPriceOr}>or {plan.credit_price} credits</Text>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}

          {selectedPlan ? (
            <>
              <View style={styles.paymentRow}>
                <Pressable
                  style={[styles.paymentBtn, paymentMethod === "credits" && styles.paymentBtnActive]}
                  onPress={() => setPaymentMethod("credits")}
                >
                  <Coins size={14} color={paymentMethod === "credits" ? INK : MUTED} />
                  <Text style={[styles.paymentBtnText, paymentMethod === "credits" && styles.paymentBtnTextActive]}>
                    Credits ({balance})
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.paymentBtn, paymentMethod === "money" && styles.paymentBtnActive]}
                  onPress={() => setPaymentMethod("money")}
                >
                  <CreditCard size={14} color={paymentMethod === "money" ? INK : MUTED} />
                  <Text style={[styles.paymentBtnText, paymentMethod === "money" && styles.paymentBtnTextActive]}>
                    Pay {formatINR(selectedPlan.price_inr)}
                  </Text>
                </Pressable>
              </View>

              {paymentMethod === "credits" && !canAffordCredits ? (
                <View style={styles.needCreditsCard}>
                  <Text style={styles.needCreditsTitle}>Need credits?</Text>
                  <Text style={styles.needCreditsBody}>
                    Not enough credits ({balance} available, {selectedPlan.credit_price} needed). Pay with cash
                    instead, or contact your Pulse administrator to receive promotional credits.
                  </Text>
                </View>
              ) : null}

              <Pressable
                style={[
                  styles.confirmBtn,
                  (paymentMethod === "credits" && !canAffordCredits) && styles.confirmBtnDisabled,
                ]}
                disabled={publishMutation.isPending || (paymentMethod === "credits" && !canAffordCredits)}
                onPress={handleConfirm}
              >
                {publishMutation.isPending ? (
                  <ActivityIndicator color={INK} size="small" />
                ) : (
                  <Text style={styles.confirmBtnText}>
                    Boost with {paymentMethod === "credits" ? `${selectedPlan.credit_price} credits` : formatINR(selectedPlan.price_inr)}
                  </Text>
                )}
              </Pressable>
            </>
          ) : null}
            </>
          )}
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
    maxHeight: "82%",
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
  loadingWrap: { paddingVertical: 32, alignItems: "center", paddingHorizontal: 8 },
  errorText: { fontSize: 12, fontWeight: "500", color: Theme.textMuted, textAlign: "center", lineHeight: 17 },
  plansList: { maxHeight: 320 },
  planCard: {
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: Theme.borderLight,
    padding: 14,
    marginBottom: 10,
    gap: 6,
  },
  planCardActive: {
    borderColor: Theme.primary,
    backgroundColor: Theme.primary + "08",
  },
  planCardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  planName: { fontSize: 14, fontWeight: "800", color: Theme.textPrimaryDark },
  planReach: { fontSize: 12, fontWeight: "500", color: Theme.textSecondary },
  planPriceRow: { flexDirection: "row", alignItems: "baseline", gap: 8, marginTop: 2 },
  planPrice: { fontSize: 15, fontWeight: "900", color: Theme.textPrimaryDark },
  planPriceOr: { fontSize: 11, fontWeight: "600", color: Theme.textMuted },
  paymentRow: { flexDirection: "row", gap: 8 },
  paymentBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  paymentBtnActive: { backgroundColor: Theme.loadAddButtonBg, borderColor: Theme.loadStatusTabBorderSoft },
  paymentBtnText: { fontSize: 12, fontWeight: "700", color: MUTED },
  paymentBtnTextActive: { color: INK },
  needCreditsCard: {
    borderRadius: 12,
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    padding: 12,
    gap: 4,
  },
  needCreditsTitle: { fontSize: 12, fontWeight: "800", color: Theme.textPrimaryDark },
  needCreditsBody: { fontSize: 11, fontWeight: "500", color: Theme.textSecondary, lineHeight: 16 },
  confirmBtn: {
    minHeight: 50,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.loadAddButtonBg,
    borderWidth: Theme.buttonPrimaryBorderWidth,
    borderColor: Theme.buttonPrimaryBorder,
  },
  confirmBtnDisabled: { opacity: 0.5 },
  confirmBtnText: { fontSize: 13, fontWeight: "800", color: INK },

  successWrap: { alignItems: "center", paddingVertical: 20, paddingHorizontal: 8, gap: 6 },
  successEmoji: { fontSize: 40, marginBottom: 4 },
  successTitle: { fontSize: 16, fontWeight: "800", color: Theme.textPrimaryDark, textAlign: "center" },
  successPlanBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: Theme.surface,
    marginTop: 4,
  },
  successPlanBadgeText: { fontSize: 12, fontWeight: "800" },
  successBody: { fontSize: 13, fontWeight: "500", color: MUTED, textAlign: "center", marginTop: 4 },
  successStartNote: { fontSize: 11, fontWeight: "600", color: Theme.textMuted, textAlign: "center", marginTop: 8 },
  successPending: { fontSize: 12, fontWeight: "500", color: Theme.textSecondary, textAlign: "center", marginTop: 6, lineHeight: 17, paddingHorizontal: 8 },
  successActionRow: { flexDirection: "row", gap: 10, width: "100%", marginTop: 18 },
  viewCampaignBtn: {
    flex: 1,
    minHeight: 50,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  viewCampaignBtnText: { fontSize: 13, fontWeight: "800", color: Theme.textPrimaryDark },
  doneBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 50,
    minWidth: "100%",
    borderRadius: 16,
    backgroundColor: Theme.loadAddButtonBg,
    borderWidth: Theme.buttonPrimaryBorderWidth,
    borderColor: Theme.buttonPrimaryBorder,
  },
  doneBtnFlex: { flex: 1, minWidth: 0 },
  doneBtnText: { fontSize: 13, fontWeight: "800", color: INK },
});
