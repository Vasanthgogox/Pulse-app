/**
 * Upgrade-to-next-plan panel — extracted from BoostProgressSheet so the same
 * upgrade flow (credits/cash toggle, price-difference math) renders
 * identically in the in-place sheet and the full Campaign Detail screen,
 * instead of two copies of the same ~100 lines.
 */
import Theme from "@/constants/Theme";
import { formatINR } from "@/lib/format";
import { useReachPlansQuery, useUpgradeReachCampaignMutation } from "@/lib/queries/useReachCampaignsQuery";
import { ChevronRight, Coins, CreditCard } from "lucide-react-native";
import { useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from "react-native";

const MUTED = Theme.loadStatusTabTextMuted;

interface CampaignUpgradePanelProps {
  orgId: string;
  campaignId: string;
  currentPlanId: string;
  /** Open the tier picker immediately (e.g. header "Upgrade Plan" button). */
  defaultExpanded?: boolean;
}

export function CampaignUpgradePanel({
  orgId,
  campaignId,
  currentPlanId,
  defaultExpanded = false,
}: CampaignUpgradePanelProps) {
  const plansQ = useReachPlansQuery();
  const upgradeMutation = useUpgradeReachCampaignMutation();
  const [showUpgrade, setShowUpgrade] = useState(defaultExpanded);
  const [upgradePaymentMethod, setUpgradePaymentMethod] = useState<"credits" | "money">("credits");

  const plan = plansQ.data?.find((p) => p.id === currentPlanId);
  const nextPlan = plan
    ? plansQ.data?.filter((p) => p.sort_order > plan.sort_order).sort((a, b) => a.sort_order - b.sort_order)[0]
    : undefined;

  if (!plan || !nextPlan) return null;

  const upgradeDiffCredits = nextPlan.credit_price - plan.credit_price;
  const upgradeDiffInr = nextPlan.price_inr - plan.price_inr;

  const handleUpgrade = async () => {
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

  if (!showUpgrade) {
    return (
      <Pressable style={styles.upgradeRow} onPress={() => setShowUpgrade(true)}>
        <Text style={styles.upgradeRowText}>
          Upgrade to {nextPlan.name} — only {upgradeDiffCredits} credits more
        </Text>
        <ChevronRight size={13} color={Theme.accentBrown} />
      </Pressable>
    );
  }

  return (
    <View style={styles.upgradeCard}>
      <Text style={styles.upgradeCardTitle}>
        Upgrade to {nextPlan.name} — only {upgradePaymentMethod === "credits" ? `${upgradeDiffCredits} credits` : formatINR(upgradeDiffInr)} more
      </Text>
      <View style={styles.paymentRow}>
        <Pressable
          style={[styles.paymentBtn, upgradePaymentMethod === "credits" && styles.paymentBtnActive]}
          onPress={() => setUpgradePaymentMethod("credits")}
        >
          <Coins size={13} color={upgradePaymentMethod === "credits" ? Theme.textOnPrimary : MUTED} />
          <Text style={[styles.paymentBtnText, upgradePaymentMethod === "credits" && styles.paymentBtnTextActive]}>
            Credits
          </Text>
        </Pressable>
        <Pressable
          style={[styles.paymentBtn, upgradePaymentMethod === "money" && styles.paymentBtnActive]}
          onPress={() => setUpgradePaymentMethod("money")}
        >
          <CreditCard size={13} color={upgradePaymentMethod === "money" ? Theme.textOnPrimary : MUTED} />
          <Text style={[styles.paymentBtnText, upgradePaymentMethod === "money" && styles.paymentBtnTextActive]}>
            Cash
          </Text>
        </Pressable>
      </View>
      <Pressable style={styles.upgradeConfirmBtn} disabled={upgradeMutation.isPending} onPress={handleUpgrade}>
        {upgradeMutation.isPending ? (
          <ActivityIndicator size="small" color={Theme.buttonPrimaryText} />
        ) : (
          <Text style={styles.upgradeConfirmBtnText}>Confirm upgrade</Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  upgradeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
    paddingHorizontal: 11,
    borderRadius: 10,
    backgroundColor: Theme.accentBrownWash,
    borderWidth: 1,
    borderColor: Theme.accentBrownBorder,
  },
  upgradeRowText: { fontSize: 11, fontWeight: "800", color: Theme.accentBrownDeep, flexShrink: 1 },
  upgradeCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
    padding: 14,
    gap: 10,
  },
  upgradeCardTitle: { fontSize: 12, fontWeight: "800", color: Theme.textPrimaryDark },
  paymentRow: { flexDirection: "row", gap: 8 },
  paymentBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  paymentBtnActive: {
    backgroundColor: Theme.primary,
    borderColor: Theme.primary,
  },
  paymentBtnText: { fontSize: 11, fontWeight: "700", color: MUTED },
  paymentBtnTextActive: { color: Theme.textOnPrimary },
  upgradeConfirmBtn: {
    minHeight: 42,
    borderRadius: Theme.buttonPrimaryRadius,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.buttonPrimary,
    borderWidth: Theme.buttonPrimaryBorderWidth,
    borderColor: Theme.buttonPrimaryBorder,
  },
  upgradeConfirmBtnText: { fontSize: 12, fontWeight: "900", color: Theme.buttonPrimaryText },
});
