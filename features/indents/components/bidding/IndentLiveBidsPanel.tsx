import { memo, useMemo, useState } from "react";
import { createStyles, text, view } from "@/lib/styles/createStyles";
import { Pressable, StyleSheet, Text, View } from "react-native";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import {
  IndentHubMedalGlyph,
  IndentHubGlyphSlot,
} from "@/features/indents/components/IndentHubAnimatedGlyphs";

import { EntityAvatar } from "@/components/EntityAvatar";
import Theme from "@/constants/Theme";
import { IndentLiveBidCard } from "@/features/indents/components/bidding/IndentLiveBidCard";
import type { DirectQuoteRow } from "@/features/indents/services/direct-quotes.service";
import { buildIndentAwardedBidAlert } from "@/features/indents/utils/bidding/indentBidAlert.util";
import { buildIndentLiveBidsViewModel } from "@/features/indents/utils/bidding/indentLiveBids.util";
import { formatINR } from "@/lib/format";

type BidFilterTag = "ALL" | "BELOW" | "VERIFIED";

export interface IndentLiveBidsPanelProps {
  quotes: DirectQuoteRow[];
  /** Client / market freight — used for per-bid margin on owner hub. */
  clientPriceInr?: number;
  targetRateInr?: number;
  /** Indent pickup — used for "Pickup due in …" on awarded bids. */
  pickupDateIso?: string | null;
  selectedQuoteId: string | null;
  onSelectQuote: (quoteId: string | null) => void;
  canSelect?: boolean;
  /** linked_organization_id values the shipper already has as integrated suppliers */
  connectedSupplierOrgIds?: Set<string>;
  onCounterOffer?: (quoteId: string) => void;
  /** Award stays on the sticky footer — not shown on bid cards. */
  onAwardBid?: (quoteId: string) => void;
  awarding?: boolean;
  /** Mobile: slim bid rows (amount focus). */
  minimalCards?: boolean;
  /** Mobile: hide filter chips to reduce noise. */
  hideFilters?: boolean;
}

export const IndentLiveBidsPanel = memo(function IndentLiveBidsPanel({
  quotes,
  clientPriceInr,
  targetRateInr,
  pickupDateIso,
  selectedQuoteId,
  onSelectQuote,
  canSelect = true,
  connectedSupplierOrgIds,
  onCounterOffer,
  onAwardBid: _onAwardBid,
  awarding: _awarding = false,
  minimalCards = false,
  hideFilters = false,
}: IndentLiveBidsPanelProps) {
  void _onAwardBid;
  void _awarding;
  const [filterTag, setFilterTag] = useState<BidFilterTag>("ALL");

  const vm = useMemo(
    () => buildIndentLiveBidsViewModel(quotes, { targetRateInr }),
    [quotes, targetRateInr],
  );

  const filteredQuotes = useMemo(() => {
    if (filterTag === "ALL") return vm.sortedQuotes;
    const target = Number(targetRateInr ?? 0);
    return vm.sortedQuotes.filter((q) => {
      if (filterTag === "BELOW") {
        if (!(target > 0)) return true;
        return Number(q.amount ?? 0) <= target;
      }
      if (filterTag === "VERIFIED") {
        return connectedSupplierOrgIds?.has(q.bidder_organization_id) ?? false;
      }
      return true;
    });
  }, [vm.sortedQuotes, filterTag, targetRateInr, connectedSupplierOrgIds]);

  const recommendedQuote = useMemo(
    () =>
      vm.recommendedQuoteId
        ? (vm.sortedQuotes.find((q) => q.id === vm.recommendedQuoteId) ?? null)
        : null,
    [vm.recommendedQuoteId, vm.sortedQuotes],
  );

  const showFilters = !hideFilters && quotes.length > 1;
  const savingsLabel =
    vm.highestPendingAmount != null &&
    vm.lowestPendingAmount != null &&
    vm.highestPendingAmount > vm.lowestPendingAmount
      ? `Saves ${formatINR(vm.highestPendingAmount - vm.lowestPendingAmount)} vs highest`
      : null;

  return (
    <View style={[styles.wrap, minimalCards && styles.wrapMinimal]}>
      {showFilters ? (
        <View style={styles.filterRow}>
          {(
            [
              ["ALL", `All (${quotes.length})`],
              ["BELOW", "Below target"],
              ["VERIFIED", "Verified"],
            ] as const
          ).map(([tag, label]) => {
            const active = filterTag === tag;
            return (
              <Pressable
                key={tag}
                onPress={() => setFilterTag(tag)}
                style={[styles.filterPill, active && styles.filterPillActive]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={label}
              >
                <Text
                  style={[
                    styles.filterPillText,
                    active && styles.filterPillTextActive,
                  ]}
                  numberOfLines={1}
                >
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {vm.showRecommendationStrip &&
      recommendedQuote &&
      filterTag === "ALL" &&
      !minimalCards ? (
        <Pressable
          style={({ pressed }) => [
            styles.recoStrip,
            pressed && styles.recoStripPressed,
            selectedQuoteId === recommendedQuote.id && styles.recoStripSelected,
          ]}
          onPress={() =>
            canSelect &&
            onSelectQuote(
              selectedQuoteId === recommendedQuote.id
                ? null
                : recommendedQuote.id,
            )
          }
          disabled={!canSelect}
          accessibilityRole="button"
          accessibilityLabel={`Select recommended bid from ${recommendedQuote.bidder_organization_name ?? "supplier"}`}
        >
          <View style={styles.recoHeader}>
            <View style={styles.recoKickerRow}>
              <IndentHubGlyphSlot size={14}>
                <IndentHubMedalGlyph size={14} />
              </IndentHubGlyphSlot>
              <Text style={styles.recoKicker}>Recommended</Text>
            </View>
            <Text style={styles.recoMeta}>
              {vm.pendingCount} live bid{vm.pendingCount === 1 ? "" : "s"}
            </Text>
          </View>
          <View style={styles.recoRow}>
            <EntityAvatar
              name={recommendedQuote.bidder_organization_name ?? "Supplier"}
              avatarUrl={recommendedQuote.bidder_avatar_url ?? null}
              avatarSeed={recommendedQuote.bidder_avatar_seed ?? null}
              initialsColorSeed={
                recommendedQuote.bidder_organization_id || recommendedQuote.id
              }
              entityType={
                recommendedQuote.offer_source === "driver_direct_bid"
                  ? "driver"
                  : "supplier"
              }
              size={28}
              showIntegrationBadge={false}
            />
            <View style={styles.recoBody}>
              <Text style={styles.recoName} numberOfLines={1}>
                {(
                  recommendedQuote.bidder_organization_name ?? "—"
                ).toUpperCase()}
              </Text>
              <Text style={styles.recoHint} numberOfLines={2}>
                Lowest rate{savingsLabel ? ` · ${savingsLabel}` : ""}
              </Text>
            </View>
            <View style={styles.recoAmountCol}>
              <Text style={styles.recoAmount}>
                {formatINR(Number(recommendedQuote.amount ?? 0))}
              </Text>
              {selectedQuoteId === recommendedQuote.id ? (
                <Text style={styles.recoSelectedLabel}>Selected</Text>
              ) : null}
            </View>
          </View>
        </Pressable>
      ) : vm.pendingCount >= 2 && filterTag === "ALL" ? (
        <Text style={styles.compareHint}>
          {vm.pendingCount} bids · sorted lowest to highest
        </Text>
      ) : null}

      {filteredQuotes.length === 0 ? (
        <View style={styles.emptyFilter}>
          <FontAwesome name="inbox" size={22} color={Theme.textMuted} />
          <Text style={styles.emptyFilterText}>No bids match this filter.</Text>
        </View>
      ) : (
        filteredQuotes.map((q) => {
          const isPending = (q.status ?? "").toLowerCase() === "pending";
          const isSelected = selectedQuoteId === q.id;
          const rawBadges = vm.badgesByQuoteId.get(q.id) ?? [];
          const alertInfo = buildIndentAwardedBidAlert(q, pickupDateIso);
          const badges = (
            vm.showRecommendationStrip
              ? rawBadges.filter((b) => b.kind !== "recommended")
              : rawBadges
          ).filter((b) => !(alertInfo && b.kind === "awarded"));
          return (
            <IndentLiveBidCard
              key={q.id}
              quote={q}
              badges={
                minimalCards
                  ? (vm.badgesByQuoteId.get(q.id) ?? []).filter(
                      (b) =>
                        b.kind === "lowest" ||
                        b.kind === "recommended" ||
                        b.kind === "awarded",
                    )
                  : badges
              }
              alertInfo={minimalCards ? null : alertInfo}
              selected={isSelected}
              disabled={!canSelect || !isPending}
              clientPriceInr={clientPriceInr}
              targetRateInr={targetRateInr}
              highestPendingAmount={vm.highestPendingAmount}
              pendingCount={vm.pendingCount}
              isConnectedPartner={
                connectedSupplierOrgIds?.has(q.bidder_organization_id) ?? false
              }
              minimal={minimalCards}
              onPress={
                canSelect && isPending
                  ? () => onSelectQuote(isSelected ? null : q.id)
                  : undefined
              }
              onCounterOffer={
                canSelect && isPending && onCounterOffer
                  ? () => {
                      onSelectQuote(q.id);
                      onCounterOffer(q.id);
                    }
                  : undefined
              }
              onAwardBid={undefined}
              awarding={false}
            />
          );
        })
      )}
    </View>
  );
});

const stylesDef = {
  wrap: view({
    marginBottom: 4,
    width: "100%",
    maxWidth: "100%",
    alignSelf: "stretch",
    gap: 8,
  }),
  wrapMinimal: view({
    gap: 8,
    marginBottom: 0,
  }),
  filterRow: view({
    flexDirection: "row",
    alignItems: "stretch",
    gap: 4,
    marginBottom: 0,
    padding: 4,
    borderRadius: 12,
    backgroundColor: Theme.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
  }),
  filterPill: view({
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 6,
    paddingVertical: 7,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  }),
  filterPillActive: view({
    backgroundColor: Theme.primaryText,
    borderWidth: 0,
  }),
  filterPillText: text({
    fontSize: 10,
    fontWeight: "600",
    color: Theme.gpayListSubtitle,
    textAlign: "center",
  }),
  filterPillTextActive: text({
    color: Theme.textOnPrimary,
    fontWeight: "700",
  }),
  emptyFilter: view({
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 28,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
  }),
  emptyFilterText: text({
    fontSize: 11,
    fontWeight: "500",
    color: Theme.gpayListSubtitle,
    textAlign: "center",
  }),
  compareHint: text({
    fontSize: 11,
    fontWeight: "500",
    color: Theme.gpayListSubtitle,
    textAlign: "left",
    paddingHorizontal: 2,
    paddingBottom: 2,
  }),
  recoStrip: view({
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.brandBlue,
    backgroundColor: Theme.brandBlueSoft,
    gap: 8,
    width: "100%",
    alignSelf: "stretch",
  }),
  recoStripPressed: view({
    opacity: 0.92,
  }),
  recoStripSelected: view({
    borderColor: Theme.primary,
    borderWidth: 1.5,
    backgroundColor: Theme.brandBlueSoft,
  }),
  recoHeader: view({
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  }),
  recoKickerRow: view({
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    flexShrink: 1,
    minWidth: 0,
  }),
  recoKicker: text({
    color: Theme.primary,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    fontSize: 9,
    fontWeight: "700",
  }),
  recoMeta: text({
    fontSize: 9,
    fontWeight: "500",
    color: Theme.gpayListSubtitle,
    flexShrink: 0,
  }),
  recoRow: view({
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  }),
  recoBody: view({
    flex: 1,
    minWidth: 0,
    gap: 2,
    paddingRight: 4,
  }),
  recoName: text({
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.15,
    color: Theme.gpayListTitle,
  }),
  recoHint: text({
    fontSize: 10,
    fontWeight: "500",
    lineHeight: 13,
    color: Theme.gpayListSubtitle,
  }),
  recoAmountCol: view({
    alignItems: "flex-end",
    justifyContent: "center",
    gap: 2,
    flexShrink: 0,
  }),
  recoAmount: text({
    fontSize: 13,
    fontWeight: "700",
    color: Theme.gpayAmountReceived,
    fontVariant: ["tabular-nums"],
    letterSpacing: -0.15,
  }),
  recoSelectedLabel: text({
    fontSize: 8,
    fontWeight: "700",
    letterSpacing: 0.3,
    textTransform: "uppercase",
    color: Theme.primary,
  }),
};

const styles = createStyles(stylesDef);
