/**
 * Give Load — integrated supplier row on the review hub left card.
 * Nudges owners to grow integrated network for more bids and better margin.
 */
import { EntityAvatar } from "@/components/EntityAvatar";
import Theme from "@/constants/Theme";
import type { DirectQuoteRow } from "@/features/indents/services/direct-quotes.service";
import type { LoadCenterIntegratedParty } from "@/features/network/utils/loadCenterIntegratedParties.util";
import { LinearGradient } from "expo-linear-gradient";
import { Check, TrendingUp, UserPlus } from "lucide-react-native";
import { useMemo, type ReactNode } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

const FACE_SIZE = 36;
const RING_SIZE = 44;
const TILE_WIDTH = 52;
const TILE_LABEL_LINE = 12;
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

function PartyTile({
  label,
  accentLabel,
  onPress,
  accessibilityLabel,
  children,
}: {
  label: string;
  accentLabel?: boolean;
  onPress?: () => void;
  accessibilityLabel: string;
  children: ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [styles.tile, pressed && onPress && styles.tilePressed]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <View style={styles.avatarSlot}>{children}</View>
      <Text
        style={[styles.tileLabel, accentLabel && styles.tileLabelAccent]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
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
  const shortName = party.displayName.split(/\s+/)[0] ?? party.displayName;

  return (
    <PartyTile
      label={shortName}
      onPress={onPress}
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
          <Check size={9} color={Theme.textOnPrimary} strokeWidth={3} />
        </View>
      ) : null}
    </PartyTile>
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

      <View style={[styles.supplierRow, compact && styles.supplierRowCompact]}>
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
            <PartyTile
              label="More"
              onPress={onAddParties}
              accessibilityLabel={`${overflow} more suppliers`}
            >
              <View style={styles.overflowCircle}>
                <Text style={styles.overflowText}>+{overflow}</Text>
              </View>
            </PartyTile>
          ) : null}

          <PartyTile
            label="Add"
            accentLabel
            onPress={onAddParties}
            accessibilityLabel="Add integrated suppliers"
          >
            <View style={styles.addCircle}>
              <UserPlus
                size={compact ? 15 : 16}
                color={Theme.loadAddButtonText}
                strokeWidth={2.2}
              />
            </View>
          </PartyTile>
        </ScrollView>
      </View>

      <LinearGradient
        colors={["rgba(205,233,247,0.5)", "rgba(255,255,255,0.85)"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[
          styles.insightCard,
          stacked && styles.insightCardStacked,
          compact && styles.insightCardCompact,
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
    gap: 8,
    paddingTop: 2,
  },
  shellCompact: {
    gap: 6,
    paddingTop: 0,
  },
  shellStacked: {
    gap: 6,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    paddingHorizontal: 2,
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
  supplierRow: {
    backgroundColor: Theme.surfaceLight,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
    paddingVertical: 8,
    paddingHorizontal: 6,
  },
  supplierRowCompact: {
    paddingVertical: 6,
    borderRadius: 10,
  },
  scrollContent: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 4,
    paddingHorizontal: 2,
  },
  tile: {
    width: TILE_WIDTH,
    alignItems: "center",
    gap: 6,
  },
  tilePressed: {
    opacity: 0.88,
    transform: [{ scale: 0.97 }],
  },
  avatarSlot: {
    width: RING_SIZE,
    height: RING_SIZE,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  faceRing: {
    width: RING_SIZE,
    height: RING_SIZE,
    borderRadius: RING_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
  },
  faceRingBid: {
    borderColor: Theme.positive,
    backgroundColor: "rgba(21,128,61,0.06)",
  },
  faceRingIdle: {
    borderColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
  },
  bidBadge: {
    position: "absolute",
    top: -1,
    right: -1,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Theme.positive,
    borderWidth: 2,
    borderColor: Theme.cardWhite,
    alignItems: "center",
    justifyContent: "center",
  },
  tileLabel: {
    fontSize: 8,
    fontWeight: "700",
    color: Theme.textSecondary,
    textAlign: "center",
    width: TILE_WIDTH,
    lineHeight: TILE_LABEL_LINE,
    minHeight: TILE_LABEL_LINE,
  },
  tileLabelAccent: {
    color: Theme.loadAddButtonText,
  },
  addCircle: {
    width: RING_SIZE,
    height: RING_SIZE,
    borderRadius: RING_SIZE / 2,
    backgroundColor: Theme.cardWhite,
    borderWidth: 1.5,
    borderColor: Theme.loadStatusTabTrayBorder,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
  },
  overflowCircle: {
    width: RING_SIZE,
    height: RING_SIZE,
    borderRadius: RING_SIZE / 2,
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
  insightCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.loadStatusTabTrayBorder,
  },
  insightCardCompact: {
    paddingVertical: 8,
    paddingHorizontal: 8,
    gap: 8,
  },
  insightCardStacked: {
    flexWrap: "wrap",
    alignItems: "flex-start",
    rowGap: 8,
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
