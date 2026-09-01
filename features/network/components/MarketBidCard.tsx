/**
 * Market bid card — Review Hub v1.
 * A DCO/fleet-owner bid placed directly on this indent (market_bids), shown
 * alongside Reach/direct-quote offers in the same "Offers" list. Deliberately
 * lighter than IndentLiveBidCard: no target/margin metrics bar, no counter-
 * offer — just who's bidding, what vehicle, how much, and Accept/Reject
 * wired straight to accept_market_bid()/reject_market_bid(). Not merged into
 * IndentLiveBidCard — different source, different actions, own component.
 */
import { memo } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { EntityAvatar } from "@/components/EntityAvatar";
import Theme from "@/constants/Theme";
import { indentHubCardShadow } from "@/features/indents/styles/indentReviewHubStyles";
import type { MarketBidForIndentRow } from "@/features/network/services/marketBids.service";
import { formatINR } from "@/lib/format";
import { LoadingIndicator } from "@/components/LoadingIndicator";

export interface MarketBidCardProps {
  bid: MarketBidForIndentRow;
  busy?: boolean;
  onAccept?: () => void;
  onReject?: () => void;
}

function stripCurrencyPrefix(formatted: string): string {
  return formatted.replace(/^[^\d,.-]+/, "").trim() || formatted;
}

function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(diff) || diff < 0) return "";
  const m = Math.floor(diff / 60000);
  if (m < 1) return "Just now";
  if (m < 60) return `${m} min${m === 1 ? "" : "s"} ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function vehicleSummary(bid: MarketBidForIndentRow): string | null {
  const parts = [bid.vehicle_number, bid.vehicle_brand, bid.vehicle_capacity].filter(
    (p): p is string => Boolean(p && p.trim()),
  );
  return parts.length > 0 ? parts.join(" · ") : null;
}

export const MarketBidCard = memo(function MarketBidCard({
  bid,
  busy = false,
  onAccept,
  onReject,
}: MarketBidCardProps) {
  const status = (bid.status || "pending").toLowerCase();
  const isPending = status === "pending";
  const isAccepted = status === "accepted";
  const isRejected = status === "rejected";
  const statusLabel = isAccepted
    ? "Accepted"
    : isRejected
      ? "Rejected"
      : status === "withdrawn"
        ? "Withdrawn"
        : "Pending";

  const amountDisplay = stripCurrencyPrefix(formatINR(Number(bid.amount ?? 0)));
  const submitted = timeAgo(bid.created_at);
  const vehicle = vehicleSummary(bid);
  const bidderLabel = bid.is_fleet_owner
    ? `Fleet owner (${bid.bidder_display_name})`
    : `Driver (${bid.bidder_display_name})`;

  return (
    <View
      style={[
        styles.card,
        indentHubCardShadow as object,
        isAccepted && styles.cardAccepted,
        isRejected && styles.cardRejected,
      ]}
    >
      <View style={styles.topRow}>
        <EntityAvatar
          name={bid.bidder_display_name}
          avatarUrl={null}
          avatarSeed={bid.bidder_user_id}
          initialsColorSeed={bid.bidder_user_id}
          entityType="driver"
          showIntegrationBadge={false}
          size={28}
        />
        <View style={styles.body}>
          <View style={styles.nameRow}>
            <Text style={styles.partyName} numberOfLines={1}>
              {bidderLabel}
            </Text>
            <View style={styles.sourcePill}>
              <Text style={styles.sourcePillText}>MARKET</Text>
            </View>
          </View>
          {vehicle ? (
            <Text style={styles.vehicleText} numberOfLines={1}>
              {vehicle}
            </Text>
          ) : null}
        </View>
        <View style={styles.amountCol}>
          <Text style={styles.amount} numberOfLines={1}>
            ₹{amountDisplay}
          </Text>
          <View
            style={[
              styles.statusPill,
              isPending && styles.statusPillPending,
              isAccepted && styles.statusPillAccepted,
              isRejected && styles.statusPillRejected,
            ]}
          >
            <Text
              style={[
                styles.statusText,
                isPending && styles.statusTextPending,
                isAccepted && styles.statusTextAccepted,
                isRejected && styles.statusTextRejected,
              ]}
            >
              {statusLabel.toUpperCase()}
            </Text>
          </View>
        </View>
      </View>

      {bid.note?.trim() ? (
        <View style={styles.noteWrap}>
          <Text style={styles.noteText} numberOfLines={2}>
            &ldquo;{bid.note.trim()}&rdquo;
          </Text>
        </View>
      ) : null}

      <View style={styles.footerRow}>
        {submitted ? (
          <Text style={styles.submittedText}>{submitted}</Text>
        ) : (
          <View />
        )}
        {isPending && (onAccept || onReject) ? (
          <View style={styles.actionsRow}>
            {onReject ? (
              <TouchableOpacity
                style={[styles.actionBtn, styles.rejectBtn]}
                onPress={onReject}
                disabled={busy}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Reject this Market bid"
              >
                <Text style={styles.rejectBtnText}>Reject</Text>
              </TouchableOpacity>
            ) : null}
            {onAccept ? (
              <TouchableOpacity
                style={[styles.actionBtn, styles.acceptBtn, busy && styles.actionBtnDisabled]}
                onPress={onAccept}
                disabled={busy}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Accept this Market bid"
              >
                {busy ? (
                  <LoadingIndicator size="small" color={Theme.textOnPrimary} />
                ) : (
                  <Text style={styles.acceptBtnText}>Accept</Text>
                )}
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
    padding: 12,
    gap: 8,
  },
  cardAccepted: {
    borderColor: Theme.positiveMutedDarkBorder,
  },
  cardRejected: {
    borderColor: Theme.borderMedium,
    opacity: 0.86,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  body: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  partyName: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.gpayListTitle,
    flexShrink: 1,
  },
  sourcePill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: Theme.aggregatePillBg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.aggregatePillBorder,
  },
  sourcePillText: {
    fontSize: 8,
    fontWeight: "700",
    letterSpacing: 0.4,
    color: Theme.aggregatePillText,
  },
  vehicleText: {
    fontSize: 11,
    fontWeight: "500",
    color: Theme.gpayListSubtitle,
  },
  amountCol: {
    alignItems: "flex-end",
    gap: 4,
    flexShrink: 0,
  },
  amount: {
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: -0.2,
    color: Theme.gpayListTitle,
    fontVariant: ["tabular-nums"],
  },
  statusPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: Theme.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderMedium,
  },
  statusPillPending: {
    backgroundColor: Theme.positiveMuted,
    borderColor: Theme.positiveMutedDarkBorder,
  },
  statusPillAccepted: {
    backgroundColor: Theme.positiveMuted,
    borderColor: Theme.positiveMutedDarkBorder,
  },
  statusPillRejected: {
    backgroundColor: Theme.negativeMuted,
    borderColor: Theme.borderMedium,
  },
  statusText: {
    fontSize: 8,
    fontWeight: "700",
    letterSpacing: 0.35,
    color: Theme.textMuted,
  },
  statusTextPending: { color: Theme.positive },
  statusTextAccepted: { color: Theme.positive },
  statusTextRejected: { color: Theme.teslaRed },
  noteWrap: {
    paddingHorizontal: 2,
  },
  noteText: {
    fontSize: 11,
    fontStyle: "italic",
    color: Theme.gpayListSubtitle,
    lineHeight: 15,
  },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  submittedText: {
    fontSize: 10,
    fontWeight: "500",
    color: Theme.gpayListSubtitle,
  },
  actionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  actionBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    minHeight: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  actionBtnDisabled: {
    opacity: 0.6,
  },
  rejectBtn: {
    backgroundColor: Theme.cardWhite,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderMedium,
  },
  rejectBtnText: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textSecondary,
  },
  acceptBtn: {
    backgroundColor: Theme.darkBackground,
    minWidth: 72,
  },
  acceptBtnText: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textOnPrimary,
  },
});
