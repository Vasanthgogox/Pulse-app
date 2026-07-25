/**
 * Trip-grouped campaign card — compact HTML-mock density. Multiple campaigns on
 * the same post collapse into one identity block with plan drill-down.
 * Snapshot_* fields keep load identity accurate if the source story changes.
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
import { ChevronDown, ChevronRight, MapPin, Truck, Zap } from "lucide-react-native";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

interface ReachCampaignCardProps {
  campaigns: ReachCampaignRow[];
  planById: Map<string, ReachPlanRow>;
  onCampaignPress: (campaignId: string) => void;
}

function statusPillColors(status: ReachCampaignStatus): { bg: string; border: string; text: string } {
  if (status === "active") {
    return {
      bg: Theme.positiveMuted,
      border: Theme.networkHubListCardConnectedBorder,
      text: Theme.success,
    };
  }
  if (status === "cancelled") {
    return { bg: Theme.surface, border: Theme.borderLight, text: Theme.textMuted };
  }
  return { bg: Theme.surface, border: Theme.borderLight, text: Theme.textSecondary };
}

function StatusPill({ status }: { status: ReachCampaignStatus }) {
  const c = statusPillColors(status);
  return (
    <View style={[styles.statusPill, { backgroundColor: c.bg, borderColor: c.border }]}>
      <Text style={[styles.statusPillText, { color: c.text }]}>{status}</Text>
    </View>
  );
}

function PlanChip({ plan }: { plan: ReachPlanRow | undefined }) {
  const display = plan ? getReachPlanDisplay(plan.code) : undefined;
  const color = display?.color ?? Theme.primary;
  return (
    <View style={[styles.planChip, { backgroundColor: color + "14", borderColor: color + "40" }]}>
      <Zap size={10} color={color} />
      <Text style={[styles.planChipName, { color }]}>
        {plan?.name ?? "Boost"}
        {plan ? ` · ${formatINR(plan.price_inr)}` : ""}
      </Text>
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
          <StatusPill status={campaign.status} />
          <ChevronRight size={13} color={Theme.textMuted} />
        </View>
      </View>
      {reason ? <Text style={styles.reasonText}>Reason: {reason}</Text> : null}
      <ReachMetricsGrid campaignId={campaign.id} withDivider />
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
  const tripId = formatReachTripId(primary);
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
        <View style={styles.topRow}>
          <View style={styles.topLeft}>
            <View style={styles.titleRow}>
              <Text style={styles.identityTitle} numberOfLines={1}>{title}</Text>
              <StatusPill status={groupStatus} />
              {isMulti ? (
                expanded ? (
                  <ChevronDown size={14} color={Theme.textMuted} />
                ) : (
                  <ChevronRight size={14} color={Theme.textMuted} />
                )
              ) : null}
            </View>

            {subtitle ? <Text style={styles.identityMeta} numberOfLines={1}>{subtitle}</Text> : null}

            <View style={styles.metaRow}>
              {hasRoute ? (
                <View style={styles.metaItem}>
                  <MapPin size={11} color={Theme.textMuted} />
                  <Text style={styles.metaStrong} numberOfLines={1}>
                    {primary.snapshot_origin} → {primary.snapshot_destination}
                  </Text>
                </View>
              ) : null}
              {isVehicle && primary.snapshot_origin ? (
                <View style={styles.metaItem}>
                  <MapPin size={11} color={Theme.textMuted} />
                  <Text style={styles.metaStrong} numberOfLines={1}>
                    {primary.snapshot_origin}
                  </Text>
                </View>
              ) : null}
              {primary.snapshot_vehicle_type ? (
                <>
                  {(hasRoute || (isVehicle && primary.snapshot_origin)) ? (
                    <Text style={styles.metaDot}>·</Text>
                  ) : null}
                  <View style={styles.metaItem}>
                    <Truck size={11} color={Theme.textMuted} />
                    <Text style={styles.identityMeta} numberOfLines={1}>
                      {primary.snapshot_vehicle_type}
                    </Text>
                  </View>
                </>
              ) : null}
            </View>
          </View>

          <Text style={styles.tripIdText}>{tripId}</Text>
        </View>

        <View style={styles.midRow}>
          {!isMulti ? <PlanChip plan={singlePlan} /> : (
            <Text style={styles.campaignCount}>{campaigns.length} campaigns</Text>
          )}
          {postedLabel ? <Text style={styles.postedText}>Posted {postedLabel}</Text> : null}
        </View>

        {singleReason ? <Text style={styles.reasonText}>Reason: {singleReason}</Text> : null}
      </Pressable>

      {!isMulti ? (
        <Pressable onPress={() => onCampaignPress(primary.id)}>
          <ReachMetricsGrid campaignId={primary.id} withDivider />
        </Pressable>
      ) : (
        <View style={styles.multiBody}>
          {!expanded ? (
            <Pressable style={styles.collapsedPlans} onPress={() => setExpanded(true)}>
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
    padding: 12,
    gap: 8,
  },
  identityPress: { gap: 6 },
  topRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  topLeft: { flex: 1, minWidth: 0, gap: 4 },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  identityTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.2,
  },
  identityMeta: { fontSize: 11, fontWeight: "500", color: Theme.textMuted },
  metaStrong: { fontSize: 11, fontWeight: "600", color: Theme.textSecondary, flexShrink: 1 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 4, flexWrap: "wrap" },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 3, maxWidth: "100%" },
  metaDot: { fontSize: 11, color: Theme.textMuted },
  tripIdText: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textMuted,
    letterSpacing: 0.2,
    flexShrink: 0,
  },
  midRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    flexWrap: "wrap",
  },
  postedText: { fontSize: 10, fontWeight: "500", color: Theme.textMuted },
  statusPill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: 1,
  },
  statusPillText: { fontSize: 9, fontWeight: "800", textTransform: "capitalize" },
  reasonText: { fontSize: 9, fontWeight: "600", color: Theme.textMuted },

  planChip: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 7,
    borderWidth: 1,
  },
  planChipName: { fontSize: 10, fontWeight: "800" },
  campaignCount: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },

  multiBody: { gap: 6 },
  collapsedPlans: { gap: 6 },
  planChipRow: { flexDirection: "row", flexWrap: "wrap", gap: 5 },
  expandedList: { gap: 6 },
  planRow: {
    gap: 6,
    padding: 8,
    borderRadius: 10,
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  planRowHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
  },
  planRowRight: { flexDirection: "row", alignItems: "center", gap: 4, flexShrink: 0 },
});
