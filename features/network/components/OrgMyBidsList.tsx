/**
 * A4.4 Phase 4 — org "My Bids": this organization's own Marketplace bids,
 * grouped by status. Mirrors the driver app's MyBidsContent shape (grouped
 * Pending/Accepted/Closed cards), backed by list_my_org_market_bids instead
 * of a plain market_bids select — see findLoadsForOrg.service.ts.
 *
 * Contact reveal is resolved entirely server-side (Marketplace
 * contact-visibility policy): owner_phone is only non-null once a bid is
 * accepted, so this component never has to decide when to show it — it
 * renders owner_phone ?? owner_masked_phone as-is.
 */
import Theme from "@/constants/Theme";
import {
  type MyOrgMarketBidRow,
  type MyOrgMarketBidStatus,
} from "@/features/network/services/findLoadsForOrg.service";
import { getTripByIndentId } from "@/features/trips/services/trips.service";
import { ROUTES } from "@/lib/routes";
import { useRouter } from "expo-router";
import { ChevronRight, Inbox } from "lucide-react-native";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

function formatAmount(amount: number | null | undefined): string {
  if (amount == null || !Number.isFinite(Number(amount))) return "—";
  return `₹${Number(amount).toLocaleString("en-IN")}`;
}

function formatSubmittedAt(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function statusLabel(status: MyOrgMarketBidStatus): string {
  switch (status) {
    case "pending":
      return "Pending";
    case "accepted":
      return "Awarded";
    case "rejected":
      return "Not selected";
    case "withdrawn":
      return "Withdrawn";
    case "superseded":
      return "Superseded";
    default:
      return status;
  }
}

/** A6.4: the bid became moot before the business decided on it -- not a
 * rejection. (Superseding keys off the submitting account's own
 * availability, same mechanism as the DCO path -- see is_driver_available().) */
function statusExplanation(status: MyOrgMarketBidStatus): string | null {
  if (status === "superseded") {
    return "Another opportunity was awarded before this bid could be decided.";
  }
  return null;
}

function routeLabel(bid: MyOrgMarketBidRow): string {
  const from = (bid.pickup_area ?? "").trim() || "Pickup";
  const to = (bid.drop_location ?? "").trim() || "Drop";
  return `${from} → ${to}`;
}

export function OrgMyBidsList({
  bids,
  isLoading,
}: {
  bids: MyOrgMarketBidRow[];
  isLoading: boolean;
}) {
  const groups = useMemo(() => {
    const pending: MyOrgMarketBidRow[] = [];
    const awarded: MyOrgMarketBidRow[] = [];
    const closed: MyOrgMarketBidRow[] = [];
    for (const b of bids) {
      if (b.status === "pending") pending.push(b);
      else if (b.status === "accepted") awarded.push(b);
      else closed.push(b);
    }
    return { pending, awarded, closed };
  }, [bids]);

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <Text style={styles.message}>Loading your bids…</Text>
      </View>
    );
  }

  if (bids.length === 0) {
    return (
      <View style={styles.empty}>
        <Inbox size={22} color={Theme.primary} />
        <Text style={styles.emptyTitle}>No bids yet</Text>
        <Text style={styles.emptyBody}>
          Bid on an open Marketplace load and it will show up here.
        </Text>
      </View>
    );
  }

    return (
    <View style={styles.listContent}>
      {groups.awarded.length > 0 ? (
        <Section title="Awarded" count={groups.awarded.length}>
          {groups.awarded.map((b) => (
            <BidCard key={b.id} bid={b} />
          ))}
        </Section>
      ) : null}
      {groups.pending.length > 0 ? (
        <Section title="Pending" count={groups.pending.length}>
          {groups.pending.map((b) => (
            <BidCard key={b.id} bid={b} />
          ))}
        </Section>
      ) : null}
      {groups.closed.length > 0 ? (
        <Section title="Not selected" count={groups.closed.length}>
          {groups.closed.map((b) => (
            <BidCard key={b.id} bid={b} />
          ))}
        </Section>
      ) : null}
    </View>
  );
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>
        {title.toUpperCase()} · {count}
      </Text>
      <View style={{ gap: 8 }}>{children}</View>
    </View>
  );
}

function BidCard({ bid }: { bid: MyOrgMarketBidRow }) {
  const router = useRouter();
  const isAccepted = bid.status === "accepted";
  const isRejected = bid.status === "rejected";
  const phoneDisplay = bid.owner_phone ?? bid.owner_masked_phone;
  const [isNavigating, setIsNavigating] = useState(false);

  // Reuses the existing Indent allocation flow end to end (same as Load Center's
  // "Get Load -> Allocate" CTA) -- mirrors IndentDetailScreen's handleSupplierAllocate:
  // route to the trip if allocation already happened elsewhere, otherwise open Allocation.
  const handleAssignVehicle = async () => {
    if (isNavigating) return;
    setIsNavigating(true);
    try {
      const res = await getTripByIndentId(bid.indent_id);
      if (res.trip?.id) {
        router.push(ROUTES.tripAssignment(res.trip.id, "vehicle") as never);
      } else {
        router.push(ROUTES.indentAllocation(bid.indent_id) as never);
      }
    } finally {
      setIsNavigating(false);
    }
  };

  return (
    <View
      style={[
        styles.card,
        isAccepted && styles.cardAccepted,
        isRejected && styles.cardRejected,
      ]}
    >
      <View style={styles.cardTop}>
        <Text style={styles.amount}>{formatAmount(bid.amount)}</Text>
        <View
          style={[
            styles.statusPill,
            isAccepted && styles.statusPillAccepted,
            isRejected && styles.statusPillRejected,
          ]}
        >
          <Text
            style={[
              styles.statusText,
              isAccepted && styles.statusTextAccepted,
              isRejected && styles.statusTextRejected,
            ]}
          >
            {statusLabel(bid.status).toUpperCase()}
          </Text>
        </View>
      </View>

      <Text style={styles.route} numberOfLines={1}>
        {routeLabel(bid)}
      </Text>
      <Text style={styles.meta}>{bid.owner_organization_name ?? "Unknown shipper"}</Text>

      {isAccepted && phoneDisplay ? (
        <Text style={styles.contact}>{phoneDisplay}</Text>
      ) : null}

      {bid.note?.trim() ? (
        <Text style={styles.note} numberOfLines={2}>
          &ldquo;{bid.note.trim()}&rdquo;
        </Text>
      ) : null}

      {statusExplanation(bid.status) ? (
        <Text style={styles.note} numberOfLines={2}>
          {statusExplanation(bid.status)}
        </Text>
      ) : null}

      {isAccepted ? (
        <Pressable
          onPress={handleAssignVehicle}
          disabled={isNavigating}
          style={({ pressed }) => [
            styles.assignRow,
            pressed && styles.assignRowPressed,
          ]}
        >
          <Text style={styles.assignRowLabel}>Your bid was accepted</Text>
          <View style={styles.assignRowCta}>
            <Text style={styles.assignRowCtaText}>
              {isNavigating ? "Opening…" : "Assign Vehicle"}
            </Text>
            <ChevronRight size={14} color={Theme.positive} />
          </View>
        </Pressable>
      ) : null}

      <Text style={styles.submitted}>Submitted {formatSubmittedAt(bid.created_at)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  centered: { padding: 24, alignItems: "center" },
  message: { fontSize: 14, color: Theme.textSecondary },
  empty: {
    margin: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
    backgroundColor: Theme.cardWhite,
    padding: 20,
    alignItems: "center",
    gap: 6,
  },
  emptyTitle: { fontSize: 15, fontWeight: "800", color: Theme.primaryText },
  emptyBody: { fontSize: 13, color: Theme.textSecondary, textAlign: "center" },
  listContent: { paddingHorizontal: 16, paddingBottom: 32, gap: 16 },
  section: { gap: 8 },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.4,
    color: Theme.textMuted,
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
    padding: 14,
    backgroundColor: Theme.cardWhite,
    gap: 4,
  },
  cardAccepted: { borderColor: Theme.positiveMutedDarkBorder },
  cardRejected: { opacity: 0.8 },
  cardTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  amount: { fontSize: 16, fontWeight: "700", color: Theme.primary },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: Theme.surfaceGray,
  },
  statusPillAccepted: { backgroundColor: Theme.positiveMuted },
  statusPillRejected: { backgroundColor: Theme.negativeMuted },
  statusText: { fontSize: 10, fontWeight: "700", color: Theme.textMuted },
  statusTextAccepted: { color: Theme.positive },
  statusTextRejected: { color: Theme.negative },
  route: { fontSize: 15, fontWeight: "700", color: Theme.primaryText, marginTop: 2 },
  meta: { fontSize: 12, color: Theme.textSecondary },
  contact: { fontSize: 12, fontWeight: "600", color: Theme.primaryText, marginTop: 2 },
  note: { fontSize: 12, fontStyle: "italic", color: Theme.textSecondary },
  submitted: { fontSize: 11, color: Theme.textMuted, marginTop: 2 },
  assignRow: {
    marginTop: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.positiveMutedDarkBorder,
    backgroundColor: Theme.positiveMuted,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  assignRowPressed: { opacity: 0.7 },
  assignRowLabel: { fontSize: 12, fontWeight: "600", color: Theme.primaryText },
  assignRowCta: { flexDirection: "row", alignItems: "center", gap: 2 },
  assignRowCtaText: { fontSize: 13, fontWeight: "800", color: Theme.positive },
});
