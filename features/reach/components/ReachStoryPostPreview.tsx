/**
 * Campaign ad preview — light-mode creative card for Reach Campaign Manager.
 * Ads Manager style: white surface, sponsored label, structured specs, primary CTA.
 */
import Theme from "@/constants/Theme";
import type { ReachCampaignRow, ReachPlanRow } from "@/features/reach/services/campaigns.service";
import { getCampaignIdentity } from "@/features/reach/utils/campaignIdentity";
import { formatINR } from "@/lib/format";
import { getReachPlanDisplay } from "@/lib/reachPlanRegistry";
import { Hand, MapPin, Send, Truck } from "lucide-react-native";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

interface ReachStoryPostPreviewProps {
  campaign: ReachCampaignRow | null;
  plan: ReachPlanRow | undefined;
  orgName: string;
  onOpenCampaign?: () => void;
  /** Detail screen: Driver/Fleet perspective toggle showing what each
   * audience's CTA looks like. Off in the studio reel. */
  showAudienceToggle?: boolean;
}

export function ReachStoryPostPreview({
  campaign,
  plan,
  orgName,
  onOpenCampaign,
  showAudienceToggle = false,
}: ReachStoryPostPreviewProps) {
  const id = campaign ? getCampaignIdentity(campaign) : null;
  const isActive = campaign?.status === "active";
  const [audience, setAudience] = useState<"driver" | "fleet">("driver");
  const fareLabel =
    campaign?.load_rate != null && campaign.load_rate > 0
      ? formatINR(campaign.load_rate)
      : "On request";
  const rewardAmount =
    campaign?.driver_reward_enabled && campaign.reward_amount > 0
      ? campaign.reward_amount
      : null;
  const driverMode = showAudienceToggle && audience === "driver";
  const fleetMode = showAudienceToggle && audience === "fleet";
  const planDisplay = plan ? getReachPlanDisplay(plan.code) : undefined;
  const planColor = planDisplay?.color ?? Theme.primary;

  return (
    <View style={styles.shell}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerTitle}>Ad preview</Text>
          <Text style={styles.headerSub}>Driver feed creative</Text>
        </View>
        {showAudienceToggle ? (
          <View style={styles.audienceToggle}>
            {(["driver", "fleet"] as const).map((a) => (
              <Pressable
                key={a}
                onPress={() => setAudience(a)}
                style={[styles.audienceBtn, audience === a && styles.audienceBtnActive]}
              >
                <Text
                  style={[
                    styles.audienceText,
                    audience === a && styles.audienceTextActive,
                  ]}
                >
                  {a === "driver" ? "Driver" : "Fleet"}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : (
          <View
            style={[
              styles.statusBadge,
              isActive ? styles.statusBadgeLive : styles.statusBadgeIdle,
            ]}
          >
            <View
              style={[
                styles.statusDot,
                {
                  backgroundColor: isActive
                    ? Theme.success
                    : Theme.textMuted,
                },
              ]}
            />
            <Text
              style={[
                styles.statusBadgeText,
                isActive && styles.statusBadgeTextLive,
              ]}
            >
              {campaign ? (isActive ? "Delivering" : campaign.status) : "Empty"}
            </Text>
          </View>
        )}
      </View>

      {campaign && id ? (
        <View style={styles.creative}>
          <View style={styles.identityRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{id.initials}</Text>
            </View>
            <View style={styles.identityText}>
              <Text style={styles.title} numberOfLines={1}>
                {id.title}
              </Text>
              <Text style={styles.advertiser} numberOfLines={1}>
                {orgName} · Sponsored
              </Text>
            </View>
            {plan ? (
              <View
                style={[
                  styles.planChip,
                  {
                    backgroundColor: planColor + "14",
                    borderColor: planColor + "35",
                  },
                ]}
              >
                <Text style={[styles.planChipText, { color: planColor }]}>
                  {plan.name}
                </Text>
              </View>
            ) : null}
          </View>

          <View style={styles.routeBlock}>
            <MapPin size={14} color={Theme.primary} strokeWidth={2.2} />
            <Text style={styles.routeText} numberOfLines={2}>
              {id.route ?? "Route not set"}
            </Text>
          </View>

          <View style={styles.specGrid}>
            <View style={styles.specCell}>
              <View style={styles.specIcon}>
                <Truck size={12} color={Theme.textMuted} strokeWidth={2.2} />
              </View>
              <View style={styles.specCopy}>
                <Text style={styles.specLabel}>Vehicle</Text>
                <Text style={styles.specValue} numberOfLines={2}>
                  {id.truck ?? "Any vehicle"}
                </Text>
              </View>
            </View>
            <View style={styles.specDivider} />
            <View style={styles.specCell}>
              <View style={styles.specCopy}>
                <Text style={styles.specLabel}>Trip ID</Text>
                <Text style={styles.specValue} numberOfLines={1}>
                  {id.tripId}
                </Text>
              </View>
            </View>
            <View style={styles.specDivider} />
            <View style={styles.specCell}>
              <View style={styles.specCopy}>
                <Text style={styles.specLabel}>Est. fare</Text>
                <Text style={styles.specFare} numberOfLines={1}>
                  {fareLabel}
                </Text>
              </View>
            </View>
          </View>

          {driverMode ? (
            <View style={styles.ctaBlock}>
              {campaign.distribution_channels?.includes("driver") ? (
                <>
                  <Pressable
                    style={[styles.cta, styles.ctaSecondary]}
                    onPress={onOpenCampaign}
                  >
                    <Send size={13} color={Theme.primary} />
                    <Text style={styles.ctaSecondaryText}>
                      Recommend to Fleet
                      {rewardAmount ? ` (+₹${rewardAmount})` : ""}
                    </Text>
                  </Pressable>
                  <Text style={styles.ctaSubtext}>
                    Drivers forward this load to their fleet for bidding
                  </Text>
                </>
              ) : (
                <>
                  <View style={[styles.cta, styles.ctaDisabled]}>
                    <Send size={13} color={Theme.textMuted} />
                    <Text style={styles.ctaDisabledText}>
                      Driver channel disabled
                    </Text>
                  </View>
                  <Text style={styles.ctaSubtext}>
                    Drivers will not see this campaign
                  </Text>
                </>
              )}
            </View>
          ) : fleetMode ? (
            <View style={styles.ctaBlock}>
              <Pressable style={styles.cta} onPress={onOpenCampaign}>
                <Hand size={13} color={Theme.textOnPrimary} />
                <Text style={styles.ctaText}>Submit fleet bid</Text>
              </Pressable>
              <Text style={styles.ctaSubtext}>
                Fleet owners quote the shipper directly
              </Text>
            </View>
          ) : (
            <Pressable
              style={styles.cta}
              onPress={onOpenCampaign}
              disabled={!onOpenCampaign}
            >
              <Text style={styles.ctaText}>
                {onOpenCampaign ? "View campaign" : "Preview only"}
              </Text>
            </Pressable>
          )}
        </View>
      ) : (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No campaign selected</Text>
          <Text style={styles.emptyBody}>
            Select a row in the table to preview the driver-facing ad creative.
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    width: "100%",
    alignSelf: "stretch",
    backgroundColor: Theme.cardWhite,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
    backgroundColor: Theme.surface,
  },
  headerLeft: { flex: 1, minWidth: 0, gap: 1 },
  headerTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  headerSub: {
    fontSize: 11,
    fontWeight: "500",
    color: Theme.textMuted,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    borderWidth: 1,
    flexShrink: 0,
  },
  statusBadgeLive: {
    backgroundColor: Theme.positiveMuted,
    borderColor: "rgba(21,128,61,0.22)",
  },
  statusBadgeIdle: {
    backgroundColor: Theme.cardWhite,
    borderColor: Theme.borderInput,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textMuted,
    textTransform: "capitalize",
  },
  statusBadgeTextLive: { color: Theme.success },

  creative: {
    padding: 14,
    gap: 12,
  },
  identityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 6,
    backgroundColor: Theme.accentBrownSoft,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  avatarText: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.accentBrownDeep,
  },
  identityText: { flex: 1, minWidth: 0, gap: 2 },
  title: {
    fontSize: 14,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.2,
  },
  advertiser: {
    fontSize: 11,
    fontWeight: "500",
    color: Theme.textMuted,
  },
  planChip: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 1,
    flexShrink: 0,
  },
  planChipText: {
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
  },

  routeBlock: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: Theme.surface,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  routeText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    lineHeight: 18,
  },

  specGrid: {
    flexDirection: "row",
    alignItems: "stretch",
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    overflow: "hidden",
  },
  specCell: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 10,
    minWidth: 0,
  },
  specIcon: { marginTop: 1 },
  specCopy: { flex: 1, minWidth: 0, gap: 2 },
  specDivider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: Theme.borderLight,
  },
  specLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  specValue: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  specFare: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.primary,
    fontVariant: ["tabular-nums"],
  },

  cta: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: Theme.primary,
    borderRadius: 6,
    paddingVertical: 11,
  },
  ctaText: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textOnPrimary,
  },
  ctaBlock: { gap: 6 },
  ctaSecondary: {
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.borderInput,
  },
  ctaSecondaryText: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.primary,
  },
  ctaDisabled: {
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  ctaDisabledText: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textMuted,
  },
  ctaSubtext: {
    fontSize: 11,
    fontWeight: "500",
    color: Theme.textMuted,
    textAlign: "center",
    lineHeight: 15,
  },

  audienceToggle: {
    flexDirection: "row",
    gap: 2,
    backgroundColor: Theme.cardWhite,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    padding: 2,
    flexShrink: 0,
  },
  audienceBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  audienceBtnActive: { backgroundColor: Theme.primary },
  audienceText: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textMuted,
  },
  audienceTextActive: { color: Theme.textOnPrimary },

  empty: {
    minHeight: 200,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingVertical: 32,
    gap: 6,
  },
  emptyTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  emptyBody: {
    fontSize: 12,
    fontWeight: "500",
    color: Theme.textMuted,
    textAlign: "center",
    lineHeight: 17,
  },
});
