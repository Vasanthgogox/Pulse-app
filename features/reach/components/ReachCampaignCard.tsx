/**
 * Trip-grouped campaign card. Multiple campaigns on the same post (e.g. Starter
 * then Growth) collapse into one identity block with a drill-down list of plans.
 * Snapshot_* fields keep the load identity accurate even if the source story
 * was later edited or deleted. Shared by Reach Home and Campaign History.
 */
import Theme from "@/constants/Theme";
import type { ReachCampaignRow, ReachCampaignStatus, ReachPlanRow } from "@/features/reach/services/campaigns.service";
import { ReachMetricsGrid } from "@/features/reach/components/ReachMetricsGrid";
import {
  cancelReasonLabel,
  formatReachTripId,
  rollupCampaignStatus,
} from "@/features/reach/utils/campaignFormat";
import {
  classifyStoredPostType,
  displayStoryContent,
  formatStoryDate,
} from "@/features/network/utils/storyDisplay";
import { formatINR } from "@/lib/format";
import { getReachPlanDisplay } from "@/lib/reachPlanRegistry";
import { ChevronDown, ChevronRight, Hash, MapPin, Rocket, Truck } from "lucide-react-native";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

interface ReachCampaignCardProps {
  /** One or more campaigns for the same post (newest first). */
  campaigns: ReachCampaignRow[];
  planById: Map<string, ReachPlanRow>;
  onCampaignPress: (campaignId: string) => void;
}

function statusColor(status: ReachCampaignStatus): string {
  if (status === "active") return Theme.success;
  if (status === "cancelled") return Theme.textMuted;
  return Theme.textSecondary;
}

function PlanChip({ plan }: { plan: ReachPlanRow | undefined }) {
  const display = plan ? getReachPlanDisplay(plan.code) : undefined;
  return (
    <View style={styles.planChip}>
      <Rocket size={12} color={display?.color ?? Theme.primary} />
      <Text style={[styles.planChipName, { color: display?.color ?? Theme.primary }]}>
        {plan?.name ?? "Boost"}
      </Text>
      {plan ? <Text style={styles.planChipPrice}>{formatINR(plan.price_inr)}</Text> : null}
    </View>
  );
}

function CampaignPlanRow({
  campaign,
  plan,
  onPress,
}: {
  campaign: ReachCampaignRow;
  plan: ReachPlanRow | undefined;
  onPress: () => void;
}) {
  const reason = campaign.status === "cancelled" ? cancelReasonLabel(campaign.cancel_reason) : null;
  return (
    <Pressable style={styles.planRow} onPress={onPress}>
      <View style={styles.planRowHeader}>
        <PlanChip plan={plan} />
        <View style={styles.planRowRight}>
          <Text style={[styles.statusText, { color: statusColor(campaign.status) }]}>
            {campaign.status}
          </Text>
          <ChevronRight size={14} color={Theme.textMuted} />
        </View>
      </View>
      {reason ? <Text style={styles.reasonText}>Reason: {reason}</Text> : null}
      <ReachMetricsGrid campaignId={campaign.id} />
    </Pressable>
  );
}

export function ReachCampaignCard({ campaigns, planById, onCampaignPress }: ReachCampaignCardProps) {
  const [expanded, setExpanded] = useState(false);
  const primary = campaigns[0];
  const isMulti = campaigns.length > 1;

  const postType = classifyStoredPostType(primary.snapshot_post_type, primary.snapshot_content);
  const isLoad = postType === "LOAD";
  const isVehicle = postType === "VEHICLE_AVAILABILITY";
  const content = displayStoryContent(primary.snapshot_content);

  const title = isLoad
    ? primary.snapshot_material?.trim() || "Load"
    : isVehicle
      ? "Vehicle Available"
      : content?.split("\n")[0]?.trim() || "Update";
  const subtitle = isVehicle ? content?.trim() || null : null;
  const hasRoute = isLoad && !!primary.snapshot_origin && !!primary.snapshot_destination;
  const postedLabel = primary.snapshot_posted_at ? formatStoryDate(primary.snapshot_posted_at) : null;
  const tripId = formatReachTripId(primary.post_id, primary.id);
  const groupStatus = rollupCampaignStatus(campaigns);

  const singlePlan = !isMulti ? planById.get(primary.plan_id) : undefined;
  const singleReason =
    !isMulti && primary.status === "cancelled" ? cancelReasonLabel(primary.cancel_reason) : null;

  return (
    <View style={styles.card}>
      <Pressable
        onPress={() => {
          if (isMulti) setExpanded((v) => !v);
          else onCampaignPress(primary.id);
        }}
        style={styles.identityPress}
      >
        <View style={styles.titleRow}>
          <Text style={styles.identityTitle} numberOfLines={1}>{title}</Text>
          <View style={styles.titleRowRight}>
            <Text style={[styles.statusText, { color: statusColor(groupStatus) }]}>
              {groupStatus}
            </Text>
            {isMulti ? (
              expanded ? (
                <ChevronDown size={16} color={Theme.textMuted} />
              ) : (
                <ChevronRight size={16} color={Theme.textMuted} />
              )
            ) : null}
          </View>
        </View>

        {subtitle ? <Text style={styles.identityMeta} numberOfLines={1}>{subtitle}</Text> : null}
        {hasRoute ? (
          <View style={styles.metaRow}>
            <MapPin size={11} color={Theme.textMuted} />
            <Text style={styles.identityMeta} numberOfLines={1}>
              {primary.snapshot_origin} → {primary.snapshot_destination}
            </Text>
          </View>
        ) : null}
        {isVehicle && primary.snapshot_origin ? (
          <View style={styles.metaRow}>
            <MapPin size={11} color={Theme.textMuted} />
            <Text style={styles.identityMeta} numberOfLines={1}>
              Current location: {primary.snapshot_origin}
            </Text>
          </View>
        ) : null}
        {primary.snapshot_vehicle_type ? (
          <View style={styles.metaRow}>
            <Truck size={11} color={Theme.textMuted} />
            <Text style={styles.identityMeta} numberOfLines={1}>{primary.snapshot_vehicle_type}</Text>
          </View>
        ) : null}

        <View style={styles.metaFooter}>
          {postedLabel ? <Text style={styles.postedText}>Posted {postedLabel}</Text> : null}
          <View style={styles.tripIdRow}>
            <Hash size={10} color={Theme.textMuted} />
            <Text style={styles.tripIdText}>{tripId}</Text>
          </View>
        </View>
      </Pressable>

      {!isMulti ? (
        <Pressable onPress={() => onCampaignPress(primary.id)} style={styles.singleBody}>
          <View style={styles.planAlignRow}>
            <PlanChip plan={singlePlan} />
            {singleReason ? <Text style={styles.reasonText}>Reason: {singleReason}</Text> : null}
          </View>
          <ReachMetricsGrid campaignId={primary.id} />
        </Pressable>
      ) : (
        <View style={styles.multiBody}>
          {!expanded ? (
            <Pressable style={styles.collapsedPlans} onPress={() => setExpanded(true)}>
              <Text style={styles.campaignCount}>{campaigns.length} campaigns</Text>
              <View style={styles.planChipRow}>
                {campaigns.map((c) => (
                  <PlanChip key={c.id} plan={planById.get(c.plan_id)} />
                ))}
              </View>
            </Pressable>
          ) : (
            <View style={styles.expandedList}>
              {campaigns.map((c) => (
                <CampaignPlanRow
                  key={c.id}
                  campaign={c}
                  plan={planById.get(c.plan_id)}
                  onPress={() => onCampaignPress(c.id)}
                />
              ))}
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Theme.cardWhite,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    padding: 14,
    gap: 10,
  },
  identityPress: { gap: 4 },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  titleRowRight: { flexDirection: "row", alignItems: "center", gap: 4, flexShrink: 0 },
  identityTitle: { flex: 1, minWidth: 0, fontSize: 14, fontWeight: "800", color: Theme.textPrimaryDark },
  identityMeta: { flex: 1, minWidth: 0, fontSize: 12, fontWeight: "600", color: Theme.textSecondary },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  metaFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginTop: 2,
    flexWrap: "wrap",
  },
  postedText: { fontSize: 10, fontWeight: "600", color: Theme.textMuted },
  tripIdRow: { flexDirection: "row", alignItems: "center", gap: 3 },
  tripIdText: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textMuted,
    letterSpacing: 0.3,
  },
  statusText: { fontSize: 11, fontWeight: "700", textTransform: "capitalize" },
  reasonText: { fontSize: 9, fontWeight: "600", color: Theme.textMuted },

  singleBody: { gap: 10 },
  planAlignRow: { gap: 4 },
  planChip: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: Theme.surface,
  },
  planChipName: { fontSize: 12, fontWeight: "800" },
  planChipPrice: { fontSize: 11, fontWeight: "700", color: Theme.textMuted },

  multiBody: { gap: 8 },
  collapsedPlans: { gap: 8 },
  campaignCount: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  planChipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  expandedList: { gap: 8 },
  planRow: {
    gap: 8,
    padding: 10,
    borderRadius: 10,
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  planRowHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  planRowRight: { flexDirection: "row", alignItems: "center", gap: 4, flexShrink: 0 },
});
