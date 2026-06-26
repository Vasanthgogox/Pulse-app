/**
 * Give Load — integrated supplier row on the review hub left card.
 * Nudges owners to grow integrated network for more bids and better margin.
 */
import { EntityAvatar } from "@/components/EntityAvatar";
import Theme from "@/constants/Theme";
import type { DirectQuoteRow } from "@/features/indents/services/direct-quotes.service";
import type { LoadCenterIntegratedParty } from "@/features/network/utils/loadCenterIntegratedParties.util";
import { LinearGradient } from "expo-linear-gradient";
import { TrendingUp, UserPlus } from "lucide-react-native";
import { useMemo } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

const FACE_SIZE = 36;
const FACE_RING_OUTER = FACE_SIZE + 8;
const TILE_WIDTH = FACE_RING_OUTER;
const MAX_VISIBLE = 6;

export type IndentGiveLoadPartiesStripProps = {
  parties: LoadCenterIntegratedParty[];
  quotes: DirectQuoteRow[];
  marginPct: number | null;
  compact?: boolean;
  stacked?: boolean;
  onAddParties: () => void;
  onPartyPress?: (party: LoadCenterIntegratedParty) => void;
};

function resolveInsightCopy(
  partyCount: number,
  bidCount: number,
  marginPct: number | null,
): { headline: string; sub: string } {
  if (partyCount === 0) {
    return {
      headline: "Grow your supplier network",
      sub: "Integrated carriers see your loads and bid — more partners means sharper rates and higher margin.",
    };
  }
  if (bidCount === 0) {
    return {
      headline:
        partyCount < 3
          ? "Add more integrated suppliers"
          : `${partyCount} suppliers connected`,
      sub:
        partyCount < 3
          ? "Each new carrier widens competition — better bids protect your freight margin."
          : "Share this load to your network — connected partners can quote in one tap.",
    };
  }
  if (marginPct != null && marginPct < 15) {
    return {
      headline: "Invite similar carriers",
      sub: "More bidders create leverage — a lower supplier rate lifts your margin on this load.",
    };
  }
  return {
    headline: `${bidCount} bid${bidCount === 1 ? "" : "s"} in — keep momentum`,
    sub: "Add integrated partners you trust to widen reach and save on the next load too.",
  };
}

function PartyFace({
  party,
  hasBid,
  onPress,
}: {
  party: LoadCenterIntegratedParty;
  hasBid: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.faceWrap, pressed && styles.facePressed]}
      accessibilityRole="button"
      accessibilityLabel={`${party.displayName}${hasBid ? ", bid received" : ""}`}
    >
      <View
        style={[
          styles.faceRing,
          hasBid ? styles.faceRingBid : styles.faceRingIdle,
        ]}
      >
        <EntityAvatar
          name={party.displayName}
          entityType={party.entityType}
          organizationImageUrl={party.organizationImageUrl}
          organizationAvatarSeed={party.organizationAvatarSeed}
          avatarUrl={party.avatarUrl}
          avatarSeed={party.avatarSeed}
          isIntegrated
          size={FACE_SIZE}
        />
      </View>
      {hasBid ? (
        <View style={styles.bidBadge}>
          <Text style={styles.bidBadgeText}>✓</Text>
        </View>
      ) : null}
      <Text style={styles.faceName} numberOfLines={1}>
        {party.displayName.split(/\s+/)[0] ?? party.displayName}
      </Text>
    </Pressable>
  );
}

export function IndentGiveLoadPartiesStrip({
  parties,
  quotes,
  marginPct,
  compact,
  stacked,
  onAddParties,
  onPartyPress,
}: IndentGiveLoadPartiesStripProps) {
  const bidderOrgIds = useMemo(
    () =>
      new Set(
        quotes
          .map((q) => (q.bidder_organization_id ?? "").trim())
          .filter(Boolean),
      ),
    [quotes],
  );
  const visibleParties = parties.slice(0, MAX_VISIBLE);
  const overflow = Math.max(0, parties.length - MAX_VISIBLE);
  const bidCount = quotes.length;
  const insight = resolveInsightCopy(parties.length, bidCount, marginPct);

  return (
    <View style={[styles.shell, compact && styles.shellCompact, stacked && styles.shellStacked]}>
      <View style={styles.headerRow}>
        <Text style={styles.kicker}>Integrated suppliers</Text>
        <View style={styles.countPill}>
          <Text style={styles.countPillText}>{parties.length}</Text>
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {visibleParties.map((party) => (
          <PartyFace
            key={party.id}
            party={party}
            hasBid={bidderOrgIds.has(party.linkedOrganizationId)}
            onPress={onPartyPress ? () => onPartyPress(party) : undefined}
          />
        ))}

        {overflow > 0 ? (
          <Pressable
            onPress={onAddParties}
            style={({ pressed }) => [styles.addTile, pressed && styles.addTilePressed]}
            accessibilityRole="button"
            accessibilityLabel={`${overflow} more suppliers`}
          >
            <View style={styles.overflowCircle}>
              <Text style={styles.overflowText}>+{overflow}</Text>
            </View>
            <Text style={styles.addLabel}>More</Text>
          </Pressable>
        ) : null}

        <Pressable
          onPress={onAddParties}
          style={({ pressed }) => [
            styles.addTile,
            pressed && styles.addTilePressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Add integrated suppliers"
        >
          <View style={styles.addCircle}>
            <UserPlus
              size={compact ? 15 : 17}
              color={Theme.loadAddButtonText}
              strokeWidth={2.2}
            />
          </View>
          <Text style={styles.addLabelPrimary}>Add</Text>
        </Pressable>
      </ScrollView>

      <LinearGradient
        colors={["rgba(205,233,247,0.5)", "rgba(255,255,255,0.85)"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[
          styles.insightCard,
          stacked && styles.insightCardStacked,
          stacked && compact && styles.insightCardStackedCompact,
        ]}
      >
        <View style={styles.insightIcon}>
          <TrendingUp size={14} color={Theme.loadAddButtonText} strokeWidth={2.4} />
        </View>
        <View style={styles.insightCopy}>
          <Text style={styles.insightHeadline} numberOfLines={1}>
            {insight.headline}
          </Text>
          <Text style={styles.insightSub} numberOfLines={2}>
            {insight.sub}
          </Text>
        </View>
        {marginPct != null ? (
          <View style={styles.marginChip}>
            <Text style={styles.marginChipLabel}>Margin</Text>
            <Text style={styles.marginChipValue}>{marginPct}%</Text>
          </View>
        ) : null}
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    gap: 10,
    paddingTop: 4,
  },
  shellCompact: {
    gap: 8,
  },
  shellStacked: {
    gap: 8,
    paddingTop: 2,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  kicker: {
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 0.7,
    textTransform: "uppercase",
    color: Theme.textRouteCard,
  },
  countPill: {
    minWidth: 22,
    height: 18,
    paddingHorizontal: 6,
    borderRadius: 9,
    backgroundColor: Theme.surfaceLight,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
    alignItems: "center",
    justifyContent: "center",
  },
  countPillText: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
  },
  scrollContent: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingVertical: 2,
    paddingRight: 4,
  },
  faceWrap: {
    width: TILE_WIDTH,
    alignItems: "center",
    gap: 5,
  },
  facePressed: {
    opacity: 0.88,
    transform: [{ scale: 0.97 }],
  },
  faceRing: {
    borderRadius: (FACE_SIZE + 6) / 2,
    padding: 2,
    borderWidth: 2,
  },
  faceRingBid: {
    borderColor: Theme.positive,
    backgroundColor: "rgba(21,128,61,0.08)",
  },
  faceRingIdle: {
    borderColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
  },
  bidBadge: {
    position: "absolute",
    top: 0,
    right: 0,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Theme.positive,
    borderWidth: 2,
    borderColor: Theme.cardWhite,
    alignItems: "center",
    justifyContent: "center",
  },
  bidBadgeText: {
    fontSize: 8,
    fontWeight: "900",
    color: Theme.textOnPrimary,
    lineHeight: 10,
  },
  faceName: {
    fontSize: 8,
    fontWeight: "700",
    color: Theme.textSecondary,
    textAlign: "center",
    width: TILE_WIDTH,
  },
  addTile: {
    width: TILE_WIDTH,
    alignItems: "center",
    gap: 5,
  },
  addTilePressed: {
    opacity: 0.88,
    transform: [{ scale: 0.97 }],
  },
  addCircle: {
    width: FACE_RING_OUTER,
    height: FACE_RING_OUTER,
    borderRadius: FACE_RING_OUTER / 2,
    backgroundColor: Theme.surfaceLight,
    borderWidth: 1.5,
    borderColor: Theme.loadStatusTabTrayBorder,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
  },
  overflowCircle: {
    width: FACE_RING_OUTER,
    height: FACE_RING_OUTER,
    borderRadius: FACE_RING_OUTER / 2,
    backgroundColor: Theme.loadAddButtonText,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: Theme.cardWhite,
  },
  overflowText: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.textOnPrimary,
  },
  addLabel: {
    fontSize: 8,
    fontWeight: "700",
    color: Theme.textMuted,
    textAlign: "center",
    width: TILE_WIDTH,
  },
  addLabelPrimary: {
    fontSize: 8,
    fontWeight: "800",
    color: Theme.loadAddButtonText,
    textAlign: "center",
    width: TILE_WIDTH,
  },
  insightCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.loadStatusTabTrayBorder,
  },
  insightCardStacked: {
    flexWrap: "wrap",
    alignItems: "flex-start",
    rowGap: 8,
  },
  insightCardStackedCompact: {
    paddingVertical: 8,
    paddingHorizontal: 8,
    gap: 8,
  },
  insightIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Theme.cardWhite,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  insightCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  insightHeadline: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.1,
  },
  insightSub: {
    fontSize: 9,
    fontWeight: "500",
    color: Theme.textSecondary,
    lineHeight: 13,
  },
  marginChip: {
    alignItems: "flex-end",
    flexShrink: 0,
    paddingLeft: 4,
    marginLeft: "auto",
  },
  marginChipLabel: {
    fontSize: 7,
    fontWeight: "700",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: Theme.textMuted,
  },
  marginChipValue: {
    fontSize: 14,
    fontWeight: "800",
    color: Theme.positive,
    fontVariant: ["tabular-nums"],
  },
});
