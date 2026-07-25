/**
 * Live driver-feed story preview — phone canvas for Reach studio / detail.
 * Uses app Theme dark surfaces (trip selection) + brand CTA, not HTML emerald.
 */
import Theme from "@/constants/Theme";
import type { ReachCampaignRow, ReachPlanRow } from "@/features/reach/services/campaigns.service";
import { getCampaignIdentity } from "@/features/reach/utils/campaignIdentity";
import { formatINR } from "@/lib/format";
import { Hand, Send } from "lucide-react-native";
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
  // The load's REAL offered rate — never the boost plan price.
  const fareLabel =
    campaign?.load_rate != null && campaign.load_rate > 0
      ? formatINR(campaign.load_rate)
      : "On request";
  const rewardAmount =
    campaign?.driver_reward_enabled && campaign.reward_amount > 0 ? campaign.reward_amount : null;
  const driverMode = showAudienceToggle && audience === "driver";
  const fleetMode = showAudienceToggle && audience === "fleet";

  return (
    <View style={styles.shell}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={[styles.liveDot, !isActive && !campaign && styles.liveDotIdle]} />
          <Text style={styles.headerTitle}>Live Driver Feed View</Text>
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
                  style={[styles.audienceText, audience === a && styles.audienceTextActive]}
                >
                  {a === "driver" ? "Driver" : "Fleet"}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : (
          <View style={styles.statusBadge}>
            <Text style={styles.statusBadgeText}>
              {campaign ? (isActive ? "Live Story" : campaign.status) : "No Story"}
            </Text>
          </View>
        )}
      </View>

      <View style={styles.progressRow}>
        <View style={styles.progressActive}>
          <View style={[styles.progressFill, { width: campaign ? "65%" : "0%" }]} />
        </View>
        <View style={styles.progressIdle} />
        <View style={styles.progressIdle} />
      </View>

      {campaign && id ? (
        <View style={styles.inner}>
          <View style={styles.identityRow}>
            <View style={styles.identityLeft}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{id.initials}</Text>
              </View>
              <View style={styles.identityText}>
                <Text style={styles.title} numberOfLines={1}>
                  {id.title}
                </Text>
                <Text style={styles.route} numberOfLines={1}>
                  {id.route ?? orgName}
                </Text>
              </View>
            </View>
            <View style={styles.sponsoredTag}>
              <Text style={styles.sponsoredText}>Sponsored</Text>
            </View>
          </View>

          <View style={styles.specCard}>
            <Text style={styles.specLabel}>Required Vehicle</Text>
            <Text style={styles.specTruck} numberOfLines={2}>
              {id.truck ?? "Any vehicle"}
            </Text>

            <View style={styles.specMeta}>
              <View style={styles.specMetaCell}>
                <Text style={styles.specMetaLabel}>Trip ID</Text>
                <Text style={styles.specMetaValue} numberOfLines={1}>
                  {id.tripId}
                </Text>
              </View>
              <View style={styles.specMetaCell}>
                <Text style={styles.specMetaLabel}>Est. Fare</Text>
                <Text style={styles.specMetaFare} numberOfLines={1}>
                  {fareLabel}
                </Text>
              </View>
            </View>
          </View>

          {driverMode ? (
            <View style={styles.ctaBlock}>
              {campaign.distribution_channels?.includes("driver") ? (
                <>
                  <Pressable style={[styles.cta, styles.ctaGold]} onPress={onOpenCampaign}>
                    <Send size={13} color={Theme.textPrimaryDark} />
                    <Text style={[styles.ctaText, styles.ctaTextGold]}>
                      Recommend to Fleet{rewardAmount ? ` (+₹${rewardAmount})` : ""}
                    </Text>
                  </Pressable>
                  <Text style={styles.ctaSubtext}>
                    Drivers send this opportunity to their fleet owner for bidding
                  </Text>
                </>
              ) : (
                <>
                  <View style={[styles.cta, styles.ctaDisabled]}>
                    <Send size={13} color={Theme.textOnDarkMuted} />
                    <Text style={[styles.ctaText, styles.ctaTextDisabled]}>
                      Driver channel disabled
                    </Text>
                  </View>
                  <Text style={styles.ctaSubtext}>
                    Driver Stories are off — drivers don't see this campaign
                  </Text>
                </>
              )}
            </View>
          ) : fleetMode ? (
            <View style={styles.ctaBlock}>
              <Pressable style={styles.cta} onPress={onOpenCampaign}>
                <Hand size={13} color={Theme.buttonPrimaryText} />
                <Text style={styles.ctaText}>Submit Fleet Owner Bid</Text>
              </Pressable>
              <Text style={styles.ctaSubtext}>
                Fleet owners submit an official quote directly to the shipper
              </Text>
            </View>
          ) : (
            <Pressable
              style={styles.cta}
              onPress={onOpenCampaign}
              disabled={!onOpenCampaign}
            >
              <Hand size={13} color={Theme.buttonPrimaryText} />
              <Text style={styles.ctaText}>
                {onOpenCampaign ? "View Full Campaign" : "Story Preview"}
              </Text>
            </Pressable>
          )}
        </View>
      ) : (
        <View style={[styles.inner, styles.innerEmpty]}>
          <Text style={styles.emptyTitle}>Select a story</Text>
          <Text style={styles.emptyBody}>
            Tap a campaign in the reel to preview how it appears on driver feeds.
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
    backgroundColor: Theme.tripSelectionSurface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Theme.tripSelectionBorder,
    padding: 16,
    gap: 12,
    overflow: "hidden",
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderOnDark,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 1,
    minWidth: 0,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Theme.accentGold,
    flexShrink: 0,
  },
  liveDotIdle: {
    backgroundColor: Theme.textOnDarkMuted,
  },
  headerTitle: {
    fontSize: 11,
    fontWeight: "900",
    color: Theme.textOnDark,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: Theme.tripSelectionInsetBg,
    borderWidth: 1,
    borderColor: Theme.tripSelectionInsetBorder,
    flexShrink: 0,
  },
  statusBadgeText: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textOnDarkMuted,
    textTransform: "uppercase",
  },

  progressRow: {
    flexDirection: "row",
    gap: 4,
  },
  progressActive: {
    flex: 1,
    height: 4,
    borderRadius: 999,
    backgroundColor: Theme.accentGoldMuted,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: Theme.accentGold,
  },
  progressIdle: {
    flex: 1,
    height: 4,
    borderRadius: 999,
    backgroundColor: Theme.tripSelectionInsetBg,
  },

  inner: {
    backgroundColor: Theme.tripSelectionSurfaceActive,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Theme.tripSelectionBorder,
    padding: 16,
    gap: 12,
  },
  innerEmpty: {
    minHeight: 200,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },

  identityRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  identityLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Theme.buttonPrimary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: Theme.buttonPrimaryBorder,
    flexShrink: 0,
  },
  avatarText: {
    fontSize: 11,
    fontWeight: "900",
    color: Theme.buttonPrimaryText,
  },
  identityText: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  title: {
    fontSize: 12,
    fontWeight: "800",
    color: Theme.textOnDark,
  },
  route: {
    fontSize: 10,
    fontWeight: "500",
    color: Theme.textOnDarkMuted,
  },
  sponsoredTag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: Theme.accentGoldMuted,
    borderWidth: 1,
    borderColor: Theme.accentGoldBorder,
    flexShrink: 0,
  },
  sponsoredText: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.accentGold,
    textTransform: "uppercase",
  },

  specCard: {
    backgroundColor: Theme.tripSelectionInsetBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.tripSelectionInsetBorder,
    paddingVertical: 12,
    paddingHorizontal: 12,
    alignItems: "center",
    gap: 6,
  },
  specLabel: {
    fontSize: 9,
    fontWeight: "900",
    color: Theme.textOnDarkMuted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  specTruck: {
    fontSize: 12,
    fontWeight: "800",
    color: Theme.textOnDark,
    textAlign: "center",
  },
  specMeta: {
    flexDirection: "row",
    alignItems: "flex-start",
    alignSelf: "stretch",
    marginTop: 6,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderOnDark,
  },
  specMetaCell: {
    flex: 1,
    alignItems: "center",
    gap: 2,
    minWidth: 0,
    paddingHorizontal: 4,
  },
  specMetaLabel: {
    fontSize: 9,
    fontWeight: "500",
    color: Theme.textOnDarkMuted,
  },
  specMetaValue: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textOnDark,
    fontVariant: ["tabular-nums"],
    textAlign: "center",
  },
  specMetaFare: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.accentGold,
    fontVariant: ["tabular-nums"],
    textAlign: "center",
  },

  cta: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: Theme.buttonPrimary,
    borderRadius: Theme.buttonPrimaryRadius,
    borderWidth: Theme.buttonPrimaryBorderWidth,
    borderColor: Theme.buttonPrimaryBorder,
    paddingVertical: 11,
  },
  ctaText: {
    fontSize: 11,
    fontWeight: "900",
    color: Theme.buttonPrimaryText,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  ctaBlock: { gap: 6 },
  ctaGold: {
    backgroundColor: Theme.accentGold,
    borderColor: Theme.accentGoldBorder,
  },
  ctaTextGold: { color: Theme.textPrimaryDark },
  ctaDisabled: {
    backgroundColor: Theme.tripSelectionInsetBg,
    borderColor: Theme.tripSelectionInsetBorder,
  },
  ctaTextDisabled: { color: Theme.textOnDarkMuted },
  ctaSubtext: {
    fontSize: 9,
    fontWeight: "500",
    color: Theme.textOnDarkMuted,
    textAlign: "center",
  },
  audienceToggle: {
    flexDirection: "row",
    gap: 2,
    backgroundColor: Theme.tripSelectionInsetBg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.tripSelectionInsetBorder,
    padding: 2,
    flexShrink: 0,
  },
  audienceBtn: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  audienceBtnActive: { backgroundColor: Theme.success },
  audienceText: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textOnDarkMuted,
    textTransform: "uppercase",
  },
  audienceTextActive: { color: Theme.textPrimaryDark },

  emptyTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: Theme.textOnDark,
    marginBottom: 4,
  },
  emptyBody: {
    fontSize: 10,
    fontWeight: "500",
    color: Theme.textOnDarkMuted,
    textAlign: "center",
    lineHeight: 15,
  },
});
