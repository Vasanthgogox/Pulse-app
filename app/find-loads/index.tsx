/**
 * A4.3 — Business Find Loads: open Marketplace discovery, separate from Load
 * Center's relationship-based Get Load tab (features/network/utils/loadCenter.model.ts).
 * "Source" (All / Sponsored / Marketplace) is a distribution signal on one feed,
 * not three separate workflows — see docs/MARKETPLACE_DOMAIN.md
 * "Distribution vs monetization".
 *
 * A4.4 Phase 1 — bidding is a direct organization Market bid (market_bids,
 * bidder_type='organization'), not the story-detail Bid Sheet / direct_quotes
 * path: that mechanism is documented for the integrated-supplier network
 * model, not open Marketplace (see docs/MARKETPLACE_DOMAIN.md). No vehicle
 * selection at bid time — owner_vehicle_id only ever references an
 * individual DCO's own vehicle; an organization's fleet/driver is chosen at
 * allocation time after award (A4.4 Phase 3), same as the existing Get Load
 * → Allocate flow.
 */
import { ChromeBelowTopNavLoadingScreen } from "@/components/chromeLoadingScreens";
import { LoadingIndicator } from "@/components/LoadingIndicator";
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { useOrganization } from "@/contexts/OrganizationContext";
import {
  composeFindLoadsOpportunity,
  findLoadsDisplayId,
  findLoadsRouteLabel,
  formatFindLoadsRateOffer,
  listMyOrgMarketBids,
  listOpenMarketplaceLoadsForOrg,
  submitOrgMarketBid,
  type OrgOpenMarketplaceLoad,
} from "@/features/network/services/findLoadsForOrg.service";
import { OrgMyBidsList } from "@/features/network/components/OrgMyBidsList";
import { isVehicleTypeCompatibleWithFleet } from "@/features/marketplace/utils/fleetFit.util";
import { formatMarketplaceTransactionError } from "@/features/marketplace/utils/marketplaceErrorFormat.util";
import { getVehiclesByOrganization } from "@/features/vehicles/services/vehicles.service";
import { showAppAlert } from "@/lib/appAlert";
import { useLayoutInsets } from "@/lib/layoutInsets";
import { queryKeys } from "@/lib/queryKeys";
import { ROUTES } from "@/lib/routes";
import { useMemberAccess } from "@/lib/useMemberAccess";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Award, X } from "lucide-react-native";
import React, { useMemo, useState } from "react";
import {
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from "react-native";

type SourceFilter = "all" | "sponsored" | "marketplace";
type Segment = "discover" | "myBids";

const FILTERS: { id: SourceFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "sponsored", label: "Sponsored" },
  { id: "marketplace", label: "Marketplace" },
];

const SEGMENTS: { id: Segment; label: string }[] = [
  { id: "discover", label: "Discover" },
  { id: "myBids", label: "My Bids" },
];

export default function FindLoadsScreen() {
  const layout = useLayoutInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { currentOrganization: organization, isLoading: orgLoading } = useOrganization();
  const { can: canSurface, isLoading: accessLoading } = useMemberAccess();
  // Reuses Load Center's hub gate for this first version rather than a
  // dedicated "Find Loads" surface — see A4.3 report.
  const canViewFindLoads = canSurface("tripops.pulse_loads");
  const orgId = canViewFindLoads ? organization?.id ?? null : null;

  const [filter, setFilter] = useState<SourceFilter>("all");
  const [segment, setSegment] = useState<Segment>("discover");
  const [bidLoad, setBidLoad] = useState<OrgOpenMarketplaceLoad | null>(null);

  const contentTopInset = layout.isDesktopWeb
    ? Layout.desktopTopNavOffset
    : layout.top;

  const handleClose = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace(ROUTES.PULSE_LOADS as import("expo-router").Href);
  };

  const loadsQ = useQuery({
    queryKey: queryKeys.findLoadsForOrg.list(orgId ?? ""),
    queryFn: () => listOpenMarketplaceLoadsForOrg(orgId as string),
    enabled: !!orgId,
  });
  const loads = loadsQ.data?.loads ?? [];

  const vehiclesQ = useQuery({
    queryKey: queryKeys.vehicles.all(orgId ?? ""),
    queryFn: () => getVehiclesByOrganization(orgId as string),
    enabled: !!orgId,
  });
  const fleetVehicleTypes = useMemo(
    () => (vehiclesQ.data?.vehicles ?? []).map((v) => v.vehicle_type),
    [vehiclesQ.data],
  );

  const myBidsQ = useQuery({
    queryKey: queryKeys.findLoadsForOrg.myBids(orgId ?? ""),
    queryFn: () => listMyOrgMarketBids(orgId as string),
    enabled: !!orgId,
  });
  const myBids = myBidsQ.data?.bids ?? [];
  const awardedCount = useMemo(
    () => myBids.filter((b) => b.status === "accepted").length,
    [myBids],
  );

  const viewerCanBidCapability =
    (organization?.capabilities?.canBid ?? true) &&
    canSurface("sales.marketplace.bid");

  const filteredLoads = useMemo(() => {
    if (filter === "sponsored") return loads.filter((l) => l.is_sponsored);
    if (filter === "marketplace") return loads.filter((l) => !l.is_sponsored);
    return loads;
  }, [loads, filter]);

  const handleBidSuccess = () => {
    setBidLoad(null);
    if (orgId) {
      queryClient.invalidateQueries({ queryKey: queryKeys.findLoadsForOrg.list(orgId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.findLoadsForOrg.myBids(orgId) });
    }
    showAppAlert("Bid submitted", "The business will review your offer.");
  };

  if (accessLoading) {
    return <ChromeBelowTopNavLoadingScreen variant="preparing" />;
  }
  if (!canViewFindLoads) {
    return (
      <View style={[styles.centered, { paddingTop: contentTopInset }]}>
        <Pressable
          onPress={handleClose}
          style={({ pressed }) => [
            styles.closeBtn,
            styles.noAccessCloseBtn,
            pressed && styles.closeBtnPressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Close Find Loads"
          hitSlop={Layout.touchTargetHitSlop}
        >
          <X size={20} color={Theme.textPrimaryDark} strokeWidth={2.2} />
        </Pressable>
        <Text style={styles.message}>You don't have access to Find Loads.</Text>
      </View>
    );
  }
  if (!orgId) {
    return <ChromeBelowTopNavLoadingScreen variant={orgLoading ? "preparing" : "generic"} />;
  }

  return (
    <View style={[styles.root, { paddingTop: contentTopInset }]}>
      {awardedCount > 0 ? (
        <Pressable
          onPress={() => setSegment("myBids")}
          style={styles.awardedBanner}
        >
          <Award size={16} color={Theme.positive} />
          <Text style={styles.awardedBannerText}>
            {awardedCount === 1
              ? "You have 1 awarded bid — assign a vehicle to get started"
              : `You have ${awardedCount} awarded bids — assign vehicles to get started`}
          </Text>
        </Pressable>
      ) : null}
      <View style={styles.header}>
        <View style={styles.headerTextCol}>
          <Text style={styles.title}>Find Loads</Text>
          <Text style={styles.subtitle}>Open Marketplace opportunities</Text>
        </View>
        <Pressable
          onPress={handleClose}
          style={({ pressed }) => [
            styles.closeBtn,
            pressed && styles.closeBtnPressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Close Find Loads"
          hitSlop={Layout.touchTargetHitSlop}
        >
          <X size={20} color={Theme.textPrimaryDark} strokeWidth={2.2} />
        </Pressable>
      </View>

      <View style={styles.segmentRow}>
        {SEGMENTS.map((s) => {
          const active = segment === s.id;
          return (
            <Pressable
              key={s.id}
              onPress={() => setSegment(s.id)}
              style={[styles.segmentChip, active && styles.segmentChipActive]}
            >
              <Text style={[styles.segmentChipText, active && styles.segmentChipTextActive]}>
                {s.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {segment === "myBids" ? (
        <ScrollView contentContainerStyle={styles.myBidsScroll}>
          <OrgMyBidsList
            bids={myBids}
            isLoading={myBidsQ.isLoading}
            onPaymentUpdated={() => {
              if (orgId) {
                queryClient.invalidateQueries({ queryKey: queryKeys.findLoadsForOrg.myBids(orgId) });
              }
            }}
          />
        </ScrollView>
      ) : (
        <>
          <View style={styles.filterRow}>
            {FILTERS.map((f) => {
              const active = filter === f.id;
              return (
                <Pressable
                  key={f.id}
                  onPress={() => setFilter(f.id)}
                  style={[styles.filterChip, active && styles.filterChipActive]}
                >
                  <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                    {f.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {loadsQ.isLoading ? (
            <View style={styles.centered}>
              <Text style={styles.message}>Loading Marketplace opportunities…</Text>
            </View>
          ) : filteredLoads.length === 0 ? (
            <View style={styles.centered}>
              <Text style={styles.message}>No open Marketplace loads right now.</Text>
            </View>
          ) : (
            <FlatList
              data={filteredLoads}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.listContent}
              renderItem={({ item }) => (
                <FindLoadsCard
                  load={item}
                  fitsFleet={isVehicleTypeCompatibleWithFleet(item.vehicle_type, fleetVehicleTypes)}
                  viewerCanBidCapability={viewerCanBidCapability}
                  viewerOrgId={orgId}
                  onPress={() => setBidLoad(item)}
                />
              )}
            />
          )}
        </>
      )}

      <OrgMarketBidModal
        load={bidLoad}
        orgId={orgId}
        onClose={() => setBidLoad(null)}
        onSuccess={handleBidSuccess}
      />
    </View>
  );
}

function FindLoadsCard({
  load,
  fitsFleet,
  viewerCanBidCapability,
  viewerOrgId,
  onPress,
}: {
  load: OrgOpenMarketplaceLoad;
  fitsFleet: boolean;
  viewerCanBidCapability: boolean;
  viewerOrgId: string;
  onPress: () => void;
}) {
  const opportunity = useMemo(
    () => composeFindLoadsOpportunity(load, viewerOrgId, viewerCanBidCapability),
    [load, viewerOrgId, viewerCanBidCapability],
  );
  const rate = formatFindLoadsRateOffer(load.rate_offer);
  const biddable = opportunity.bidding.canBid;

  return (
    <Pressable
      onPress={onPress}
      disabled={!biddable}
      style={[styles.card, !biddable && styles.cardDisabled]}
    >
      <View style={styles.cardTopRow}>
        {load.is_sponsored ? (
          <View style={styles.sponsoredBadge}>
            <Text style={styles.sponsoredBadgeText}>Sponsored</Text>
          </View>
        ) : null}
        {fitsFleet ? (
          <View style={styles.fitBadge}>
            <Text style={styles.fitBadgeText}>Fits your fleet</Text>
          </View>
        ) : null}
      </View>

      <Text style={styles.route}>{findLoadsRouteLabel(load)}</Text>
      <Text style={styles.meta}>
        {[load.vehicle_type, load.load_type, load.pickup_date]
          .filter(Boolean)
          .join(" · ")}
      </Text>
      <Text style={styles.meta}>{load.creator_organization_name ?? "Unknown shipper"}</Text>

      <View style={styles.cardBottomRow}>
        <Text style={styles.rate}>{rate ?? "—"}</Text>
        <Text style={styles.displayId}>{findLoadsDisplayId(load)}</Text>
      </View>

      {!biddable ? (
        <Text style={styles.notYetBiddable}>You don't have bidding access.</Text>
      ) : null}
    </Pressable>
  );
}

/**
 * Minimal, dedicated bid-entry modal for organization Market bids. Not the
 * keypad/celebration BidSheet used for story-detail direct_quotes bidding —
 * that component is tightly coupled to the post/direct_quote mechanism this
 * flow deliberately does not use. Amount + optional note only, no vehicle
 * field (see file header).
 */
function OrgMarketBidModal({
  load,
  orgId,
  onClose,
  onSuccess,
}: {
  load: OrgOpenMarketplaceLoad | null;
  orgId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    if (load) {
      setAmount("");
      setNote("");
      setError(null);
      setSubmitting(false);
    }
  }, [load]);

  if (!load) return null;

  const parsedAmount = Number(amount.replace(/[^0-9.]/g, ""));
  const amountValid = Number.isFinite(parsedAmount) && parsedAmount > 0;

  const handleSubmit = async () => {
    if (!amountValid || submitting) return;
    setSubmitting(true);
    setError(null);
    const { error: submitErr } = await submitOrgMarketBid(
      orgId,
      load.id,
      parsedAmount,
      note,
    );
    setSubmitting(false);
    if (submitErr) {
      setError(formatMarketplaceTransactionError(submitErr.message));
      return;
    }
    onSuccess();
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.modalOverlay} />
      </TouchableWithoutFeedback>
      <View style={styles.modalCenterWrap} pointerEvents="box-none">
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>Place a bid</Text>
          <Text style={styles.modalRoute}>{findLoadsRouteLabel(load)}</Text>
          <Text style={styles.modalShipper}>
            {load.creator_organization_name ?? "Unknown shipper"}
          </Text>

          <Text style={styles.modalFieldLabel}>Bid amount (₹)</Text>
          <TextInput
            value={amount}
            onChangeText={(t) => setAmount(t.replace(/[^0-9.]/g, ""))}
            placeholder="e.g. 45000"
            keyboardType="numeric"
            style={[styles.modalInput, !amountValid && amount.length > 0 && styles.modalInputError]}
            editable={!submitting}
          />

          <Text style={styles.modalFieldLabel}>Note (optional)</Text>
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="Anything the shipper should know"
            style={styles.modalInput}
            editable={!submitting}
            multiline
          />

          {error ? <Text style={styles.modalError}>{error}</Text> : null}

          <View style={styles.modalActions}>
            <Pressable
              style={styles.modalCancelBtn}
              onPress={onClose}
              disabled={submitting}
            >
              <Text style={styles.modalCancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[
                styles.modalSubmitBtn,
                (!amountValid || submitting) && styles.modalSubmitBtnDisabled,
              ]}
              onPress={handleSubmit}
              disabled={!amountValid || submitting}
            >
              {submitting ? (
                <LoadingIndicator size="small" color={Theme.buttonPrimaryText} />
              ) : (
                <Text style={styles.modalSubmitText}>Submit Bid</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Theme.surface },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  message: { fontSize: 16, color: Theme.textSecondary },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  headerTextCol: {
    flex: 1,
    minWidth: 0,
  },
  closeBtn: {
    width: Layout.minTouchTargetSize,
    height: Layout.minTouchTargetSize,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    backgroundColor: Theme.cardWhite,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  closeBtnPressed: { opacity: 0.85 },
  noAccessCloseBtn: {
    position: "absolute",
    top: 12,
    right: 16,
  },
  awardedBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 16,
    marginTop: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: Theme.positiveMuted,
    borderWidth: 1,
    borderColor: Theme.positiveMutedDarkBorder,
  },
  awardedBannerText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
    color: Theme.primaryText,
  },
  title: { fontSize: 22, fontWeight: "700", color: Theme.primaryText },
  subtitle: { fontSize: 14, color: Theme.textSecondary, marginTop: 2 },
  segmentRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  segmentChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    backgroundColor: Theme.cardWhite,
  },
  segmentChipActive: { backgroundColor: Theme.primaryText, borderColor: Theme.primaryText },
  segmentChipText: { fontSize: 13, fontWeight: "600", color: Theme.primaryText },
  segmentChipTextActive: { color: "#fff" },
  myBidsScroll: { paddingTop: 4, paddingBottom: 32 },
  filterRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Theme.brandBlueSoft,
  },
  filterChipActive: { backgroundColor: Theme.primary },
  filterChipText: { fontSize: 13, fontWeight: "600", color: Theme.primary },
  filterChipTextActive: { color: "#fff" },
  listContent: { paddingHorizontal: 16, paddingBottom: 32, gap: 12 },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
    padding: 14,
    backgroundColor: Theme.cardWhite,
    marginBottom: 12,
  },
  cardDisabled: { opacity: 0.75 },
  cardTopRow: { flexDirection: "row", gap: 8, marginBottom: 6 },
  sponsoredBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: Theme.brandBlue,
  },
  sponsoredBadgeText: { fontSize: 11, fontWeight: "700", color: Theme.brandBlueInk },
  fitBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: Theme.positiveMuted,
  },
  fitBadgeText: { fontSize: 11, fontWeight: "700", color: Theme.positive },
  route: { fontSize: 16, fontWeight: "700", color: Theme.primaryText },
  meta: { fontSize: 13, color: Theme.textSecondary, marginTop: 2 },
  cardBottomRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 10,
  },
  rate: { fontSize: 16, fontWeight: "700", color: Theme.primary },
  displayId: { fontSize: 12, color: Theme.textSecondary },
  notYetBiddable: { fontSize: 12, color: Theme.textSecondary, marginTop: 8, fontStyle: "italic" },
  modalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Theme.overlayBackdrop,
  },
  modalCenterWrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalCard: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: Theme.cardWhite,
    borderRadius: 16,
    padding: 20,
    gap: 4,
  },
  modalTitle: { fontSize: 17, fontWeight: "700", color: Theme.textPrimaryDark },
  modalRoute: { fontSize: 14, fontWeight: "600", color: Theme.textPrimaryDark, marginTop: 6 },
  modalShipper: { fontSize: 12, color: Theme.textSecondary, marginBottom: 8 },
  modalFieldLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: Theme.textMuted,
    marginTop: 10,
    marginBottom: 4,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: Theme.borderMedium,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: Theme.textPrimaryDark,
    backgroundColor: Theme.cardWhite,
  },
  modalInputError: { borderColor: Theme.negative },
  modalError: { fontSize: 12, color: Theme.negative, marginTop: 8 },
  modalActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 16,
  },
  modalCancelBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
    alignItems: "center",
    justifyContent: "center",
  },
  modalCancelText: { fontSize: 13, fontWeight: "600", color: Theme.textSecondary },
  modalSubmitBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: 10,
    backgroundColor: Theme.buttonPrimary,
    borderWidth: Theme.buttonPrimaryBorderWidth,
    borderColor: Theme.buttonPrimaryBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  modalSubmitBtnDisabled: { opacity: 0.5 },
  modalSubmitText: { fontSize: 13, fontWeight: "700", color: Theme.buttonPrimaryText },
});
