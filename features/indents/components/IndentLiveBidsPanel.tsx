import { memo, useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Feather from "@expo/vector-icons/Feather";

import { EntityAvatar } from "@/components/EntityAvatar";
import Theme from "@/constants/Theme";
import { IndentLiveBidCard } from "@/features/indents/components/IndentLiveBidCard";
import type { DirectQuoteRow } from "@/features/indents/services/direct-quotes.service";
import { indentReviewHubText } from "@/features/indents/styles/indentReviewHubStyles";
import { buildIndentAwardedBidAlert } from "@/features/indents/utils/indentBidAlert.util";
import { buildIndentLiveBidsViewModel } from "@/features/indents/utils/indentLiveBids.util";
import { formatINR } from "@/lib/format";

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
}

export const IndentLiveBidsPanel = memo(function IndentLiveBidsPanel({
  quotes,
  clientPriceInr,
  targetRateInr,
  pickupDateIso,
  selectedQuoteId,
  onSelectQuote,
  canSelect = true,
}: IndentLiveBidsPanelProps) {
  const vm = useMemo(
    () => buildIndentLiveBidsViewModel(quotes, { targetRateInr }),
    [quotes, targetRateInr],
  );

  const recommendedQuote = useMemo(
    () =>
      vm.recommendedQuoteId
        ? vm.sortedQuotes.find((q) => q.id === vm.recommendedQuoteId) ?? null
        : null,
    [vm.recommendedQuoteId, vm.sortedQuotes],
  );

  return (
    <View style={styles.wrap}>
      {vm.showRecommendationStrip && recommendedQuote ? (
        <Pressable
          style={({ pressed }) => [
            styles.recoStrip,
            pressed && styles.recoStripPressed,
            selectedQuoteId === recommendedQuote.id && styles.recoStripSelected,
          ]}
          onPress={() =>
            canSelect &&
            onSelectQuote(
              selectedQuoteId === recommendedQuote.id ? null : recommendedQuote.id,
            )
          }
          disabled={!canSelect}
          accessibilityRole="button"
          accessibilityLabel={`Select recommended bid from ${recommendedQuote.bidder_organization_name ?? "supplier"}`}
        >
          <View style={styles.recoHeader}>
            <Feather name="star" size={12} color={Theme.primary} />
            <Text style={styles.recoKicker}>Recommended</Text>
            <Text style={styles.recoMeta}>
              {vm.pendingCount} live bid{vm.pendingCount === 1 ? "" : "s"}
            </Text>
          </View>
          <View style={styles.recoRow}>
            <EntityAvatar
              name={recommendedQuote.bidder_organization_name ?? "Supplier"}
              avatarSeed={recommendedQuote.bidder_organization_id}
              entityType="supplier"
              size={36}
              showIntegrationBadge={false}
            />
            <View style={styles.recoBody}>
              <Text style={styles.recoName} numberOfLines={1}>
                {recommendedQuote.bidder_organization_name ?? "—"}
              </Text>
              <Text style={styles.recoHint} numberOfLines={1}>
                Lowest rate
                {vm.highestPendingAmount != null &&
                vm.lowestPendingAmount != null &&
                vm.highestPendingAmount > vm.lowestPendingAmount
                  ? ` · saves ${formatINR(vm.highestPendingAmount - vm.lowestPendingAmount)} vs highest`
                  : ""}
              </Text>
            </View>
            <Text style={styles.recoAmount}>
              {formatINR(Number(recommendedQuote.amount ?? 0))}
            </Text>
          </View>
        </Pressable>
      ) : vm.pendingCount >= 2 ? (
        <Text style={styles.compareHint}>
          {vm.pendingCount} bids · sorted lowest to highest
        </Text>
      ) : null}

      {vm.sortedQuotes.map((q) => {
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
            badges={badges}
            alertInfo={alertInfo}
            selected={isSelected}
            disabled={!canSelect || !isPending}
            clientPriceInr={clientPriceInr}
            targetRateInr={targetRateInr}
            highestPendingAmount={vm.highestPendingAmount}
            pendingCount={vm.pendingCount}
            onPress={
              canSelect && isPending
                ? () => onSelectQuote(isSelected ? null : q.id)
                : undefined
            }
          />
        );
      })}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 4,
  },
  compareHint: {
    ...indentReviewHubText.bodyMuted,
    marginBottom: 8,
    textAlign: "left",
  },
  recoStrip: {
    marginBottom: 10,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(99,102,241,0.22)",
    backgroundColor: "rgba(99,102,241,0.06)",
    gap: 8,
  },
  recoStripPressed: {
    opacity: 0.92,
  },
  recoStripSelected: {
    borderColor: Theme.positive,
    backgroundColor: "rgba(21,128,61,0.06)",
  },
  recoHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  recoKicker: {
    ...indentReviewHubText.sectionTitle,
    color: Theme.primary,
    flex: 1,
  },
  recoMeta: {
    ...indentReviewHubText.chipLabel,
    fontSize: 8,
    color: Theme.textMuted,
  },
  recoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  recoBody: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  recoName: {
    ...indentReviewHubText.partyTitle,
    fontSize: 11,
  },
  recoHint: {
    ...indentReviewHubText.bodyMuted,
    fontSize: 8,
  },
  recoAmount: {
    ...indentReviewHubText.quoteRowAmount,
    fontSize: 12,
    color: Theme.textPrimaryDark,
  },
});
