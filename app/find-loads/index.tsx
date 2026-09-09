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
import { PartyAvatar } from "@/components/PartyAvatar";
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { useOrganization } from "@/contexts/OrganizationContext";
import {
  MarketplaceRouteGrid,
  MarketplaceSpecChips,
  titleCaseWord,
} from "@/features/network/components/MarketplaceLoadCardChrome";
import { OrgMyBidsList } from "@/features/network/components/OrgMyBidsList";
import type { MarketplaceFeePreview } from "@/features/network/components/bidding/BidConfirmModal";
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
import { formatStoryDate } from "@/features/network/utils/storyDisplay";
import { calculateMarketplacePlatformFee } from "@/features/network/services/marketBids.service";
import { isVehicleTypeCompatibleWithFleet } from "@/features/marketplace/utils/fleetFit.util";
import { formatMarketplaceTransactionError } from "@/features/marketplace/utils/marketplaceErrorFormat.util";
import { getVehiclesByOrganization } from "@/features/vehicles/services/vehicles.service";
import { showAppAlert } from "@/lib/appAlert";
import { formatINR } from "@/lib/format";
import { useLayoutInsets } from "@/lib/layoutInsets";
import { queryKeys } from "@/lib/queryKeys";
import { ROUTES } from "@/lib/routes";
import { useMemberAccess } from "@/lib/useMemberAccess";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Award, ChevronRight, X } from "lucide-react-native";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
  Modal,
  Platform,
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
      <View style={styles.chrome}>
      {awardedCount > 0 ? (
        <Pressable
          onPress={() => setSegment("myBids")}
          style={({ pressed }) => [
            styles.awardedBanner,
            pressed && styles.awardedBannerPressed,
          ]}
        >
          <View style={styles.awardedBannerIcon}>
            <Award size={15} color={Theme.positive} strokeWidth={2.2} />
          </View>
          <Text style={styles.awardedBannerText}>
            {awardedCount === 1
              ? "You have 1 awarded bid — assign a vehicle to get started"
              : `You have ${awardedCount} awarded bids — assign vehicles to get started`}
          </Text>
        </Pressable>
      ) : null}

      <View
        style={[
          styles.toolbar,
          layout.isDesktopWeb && styles.toolbarDesktop,
        ]}
      >
        {!layout.isDesktopWeb ? (
          <View style={styles.mobileTitleRow}>
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
              <X size={18} color={Theme.textPrimaryDark} strokeWidth={2.2} />
            </Pressable>
          </View>
        ) : null}

        <View
          style={[
            styles.toolbarMain,
            layout.isDesktopWeb && styles.toolbarMainDesktop,
          ]}
        >
          <View style={styles.segmentRow}>
            {SEGMENTS.map((s) => {
              const active = segment === s.id;
              return (
                <Pressable
                  key={s.id}
                  onPress={() => setSegment(s.id)}
                  style={[styles.segmentChip, active && styles.segmentChipActive]}
                >
                  <Text
                    style={[
                      styles.segmentChipText,
                      active && styles.segmentChipTextActive,
                    ]}
                  >
                    {s.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {segment === "discover" ? (
            <View style={styles.filterRow}>
              {FILTERS.map((f) => {
                const active = filter === f.id;
                return (
                  <Pressable
                    key={f.id}
                    onPress={() => setFilter(f.id)}
                    style={[styles.filterChip, active && styles.filterChipActive]}
                  >
                    <Text
                      style={[
                        styles.filterChipText,
                        active && styles.filterChipTextActive,
                      ]}
                    >
                      {f.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
        </View>

        {layout.isDesktopWeb ? (
          <View style={styles.toolbarRight}>
            <View style={styles.toolbarBrand}>
              <Text style={styles.toolbarBrandTitle}>Find Loads</Text>
              <Text style={styles.toolbarBrandSub}>Marketplace</Text>
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
              <X size={18} color={Theme.textPrimaryDark} strokeWidth={2.2} />
            </Pressable>
          </View>
        ) : null}
      </View>
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
              key={layout.isDesktopWeb ? "discover-desktop-4" : "discover-mobile-1"}
              numColumns={layout.isDesktopWeb ? 4 : 1}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.listContent}
              columnWrapperStyle={layout.isDesktopWeb ? styles.listRow : undefined}
              renderItem={({ item }) => (
                <FindLoadsCard
                  load={item}
                  fitsFleet={isVehicleTypeCompatibleWithFleet(item.vehicle_type, fleetVehicleTypes)}
                  viewerCanBidCapability={viewerCanBidCapability}
                  viewerOrgId={orgId}
                  isDesktop={!!layout.isDesktopWeb}
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
  isDesktop = false,
  onPress,
}: {
  load: OrgOpenMarketplaceLoad;
  fitsFleet: boolean;
  viewerCanBidCapability: boolean;
  viewerOrgId: string;
  isDesktop?: boolean;
  onPress: () => void;
}) {
  const opportunity = useMemo(
    () => composeFindLoadsOpportunity(load, viewerOrgId, viewerCanBidCapability),
    [load, viewerOrgId, viewerCanBidCapability],
  );
  const rate = formatFindLoadsRateOffer(load.rate_offer);
  const biddable = opportunity.bidding.canBid;
  const shipperRaw = (load.creator_organization_name ?? "").trim() || "Unknown shipper";
  const shipper = titleCaseWord(shipperRaw);
  const specChips = [load.vehicle_type, load.load_type]
    .map((v) => (v ?? "").trim())
    .filter(Boolean)
    .map(titleCaseWord);
  const dateLabel = load.pickup_date ? formatStoryDate(load.pickup_date) : null;

  return (
    <Pressable
      onPress={onPress}
      disabled={!biddable}
      style={({ pressed }) => [
        styles.card,
        isDesktop && styles.cardDesktop,
        !biddable && styles.cardDisabled,
        pressed && biddable && styles.cardPressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${shipper}, ${findLoadsRouteLabel(load)}, ${rate ?? "rate not listed"}`}
    >
      <View style={styles.cardTop}>
        <PartyAvatar
          name={shipper}
          initialsColorSeed={load.creator_organization_id ?? shipper}
          entityType="client"
          size={32}
        />
        <View style={styles.cardTopText}>
          <Text style={styles.orgName} numberOfLines={1}>
            {shipper}
          </Text>
          <Text style={styles.metaLine} numberOfLines={1}>
            {findLoadsDisplayId(load)}
          </Text>
        </View>
        {load.is_sponsored || fitsFleet ? (
          <View style={styles.badgeStack}>
            {load.is_sponsored ? (
              <View style={styles.sponsoredBadge}>
                <Text style={styles.sponsoredBadgeText}>Sponsored</Text>
              </View>
            ) : null}
            {fitsFleet ? (
              <View style={styles.fitBadge}>
                <Text style={styles.fitBadgeText}>Fleet fit</Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </View>

      <MarketplaceRouteGrid pickup={load.pickup_area} drop={load.drop_location} />
      <MarketplaceSpecChips chips={specChips} dateLabel={dateLabel} />

      <View style={styles.cardFooter}>
        <View style={styles.rateBlock}>
          <Text style={styles.rateLabel}>Target rate</Text>
          <Text style={styles.rate}>{rate ?? "—"}</Text>
        </View>
        {biddable ? (
          <View style={styles.bidCta}>
            <Text style={styles.bidCtaText}>Bid</Text>
            <ChevronRight size={13} color={Theme.buttonPrimaryText} strokeWidth={2.4} />
          </View>
        ) : (
          <Text style={styles.notYetBiddable}>No bidding access</Text>
        )}
      </View>
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
  const [feePreview, setFeePreview] = useState<MarketplaceFeePreview | undefined>(undefined);
  const feeRequestRef = useRef(0);

  React.useEffect(() => {
    if (load) {
      setAmount("");
      setNote("");
      setError(null);
      setSubmitting(false);
      setFeePreview(undefined);
    }
  }, [load]);

  const parsedAmount = Number(amount.replace(/[^0-9.]/g, ""));
  const amountValid = Number.isFinite(parsedAmount) && parsedAmount > 0;

  // A11.1 — live fee preview, debounced, skipped entirely for an
  // invalid/empty amount so no request fires while the field is blank.
  useEffect(() => {
    if (!load || !amountValid) {
      setFeePreview(undefined);
      return;
    }
    const requestId = ++feeRequestRef.current;
    setFeePreview({ status: "loading" });
    const timer = setTimeout(() => {
      void calculateMarketplacePlatformFee(parsedAmount).then(({ error: calcError, calc }) => {
        if (feeRequestRef.current !== requestId) return;
        if (calcError || !calc) {
          setFeePreview({ status: "error" });
          return;
        }
        if (!calc.is_active_config_found) {
          setFeePreview({ status: "inactive" });
          return;
        }
        setFeePreview({
          status: "active",
          amount: calc.resolved_fee,
          capped: Boolean(calc.capped),
        });
      });
    }, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load?.id, amountValid, parsedAmount]);

  if (!load) return null;

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

          {feePreview?.status === "active" ? (
            <View style={styles.feePreviewBlock}>
              <View style={styles.feePreviewRow}>
                <Text style={styles.feePreviewLabel}>Your bid</Text>
                <Text style={styles.feePreviewValue}>{formatINR(parsedAmount)}</Text>
              </View>
              <View style={styles.feePreviewRow}>
                <Text style={styles.feePreviewLabel}>
                  Marketplace fee{feePreview.capped ? " (capped)" : ""}
                </Text>
                <Text style={styles.feePreviewValue}>{formatINR(feePreview.amount)}</Text>
              </View>
              <Text style={styles.feePreviewNote}>
                You pay Pulse {formatINR(feePreview.amount)} separately if you win this bid
              </Text>
            </View>
          ) : feePreview?.status === "inactive" ? (
            <View style={styles.feePreviewBlock}>
              <Text style={styles.feePreviewNote}>No platform fee currently applies</Text>
            </View>
          ) : null}

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
  chrome: {
    backgroundColor: Theme.cardWhite,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 10,
    gap: 10,
  },
  toolbar: {
    gap: 10,
  },
  toolbarDesktop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    paddingVertical: 0,
    paddingHorizontal: 0,
  },
  toolbarMain: {
    gap: 12,
    minWidth: 0,
  },
  toolbarMainDesktop: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "nowrap",
    gap: 16,
  },
  toolbarRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flexShrink: 0,
  },
  mobileTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  toolbarBrand: {
    alignItems: "flex-end",
    gap: 1,
  },
  toolbarBrandTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.2,
  },
  toolbarBrandSub: {
    fontSize: 11,
    fontWeight: "500",
    color: Theme.textMuted,
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
    gap: 12,
    marginHorizontal: 0,
    marginTop: 0,
    marginBottom: 0,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: Theme.positiveMuted,
    borderWidth: 1,
    borderColor: Theme.positiveMutedDarkBorder,
  },
  awardedBannerPressed: { opacity: 0.88 },
  awardedBannerIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Theme.cardWhite,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  awardedBannerText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
    color: Theme.primaryText,
    lineHeight: 18,
  },
  title: { fontSize: 22, fontWeight: "700", color: Theme.primaryText },
  subtitle: { fontSize: 13, color: Theme.textSecondary, marginTop: 2 },
  segmentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 0,
  },
  segmentChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    minHeight: 36,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    backgroundColor: Theme.cardWhite,
    justifyContent: "center",
  },
  segmentChipActive: {
    backgroundColor: Theme.primaryText,
    borderColor: Theme.primaryText,
  },
  segmentChipText: { fontSize: 13, fontWeight: "600", color: Theme.primaryText },
  segmentChipTextActive: { color: Theme.textOnPrimary },
  myBidsScroll: { paddingTop: 12, paddingBottom: 32 },
  filterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 0,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    minHeight: 32,
    borderRadius: 20,
    backgroundColor: Theme.brandBlueSoft,
    justifyContent: "center",
  },
  filterChipActive: { backgroundColor: Theme.primary },
  filterChipText: { fontSize: 12, fontWeight: "600", color: Theme.primary },
  filterChipTextActive: { color: Theme.textOnPrimary },
  listContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 32,
    gap: 12,
  },
  listRow: { gap: 12, paddingHorizontal: 0 },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Theme.surfaceBorder,
    padding: 14,
    backgroundColor: Theme.cardWhite,
    marginBottom: 12,
    gap: 12,
    ...Platform.select({
      web: {
        boxShadow: `0 8px 20px ${Theme.actionAccentShadow}`,
      } as object,
      default: {
        shadowColor: Theme.primaryText,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
        elevation: 2,
      },
    }),
  },
  cardDesktop: {
    width: "calc((100% - 36px) / 4)" as unknown as number,
    minWidth: 0,
    flexGrow: 0,
    flexShrink: 0,
    marginBottom: 0,
  },
  cardPressed: { opacity: 0.92 },
  cardDisabled: { opacity: 0.72 },
  cardTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  cardTopText: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
    gap: 3,
  },
  orgName: {
    fontSize: 13,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.1,
    lineHeight: 18,
  },
  metaLine: {
    fontSize: 11,
    fontWeight: "500",
    color: Theme.textMuted,
    letterSpacing: 0.2,
    lineHeight: 15,
  },
  badgeStack: { alignItems: "flex-end", justifyContent: "center", gap: 4, flexShrink: 0 },
  sponsoredBadge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: Theme.brandBlue,
  },
  sponsoredBadgeText: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.3,
    textTransform: "uppercase",
    color: Theme.brandBlueInk,
  },
  fitBadge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: Theme.positiveMuted,
  },
  fitBadgeText: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.3,
    textTransform: "uppercase",
    color: Theme.positive,
  },
  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 10,
    marginTop: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.surfaceBorder,
  },
  rateBlock: { gap: 1 },
  rateLabel: {
    fontSize: 9,
    fontWeight: "600",
    letterSpacing: 0.45,
    textTransform: "uppercase",
    color: Theme.textMuted,
  },
  rate: { fontSize: 16, fontWeight: "700", color: Theme.primary, letterSpacing: -0.3 },
  bidCta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: Theme.buttonPrimary,
    borderWidth: Theme.buttonPrimaryBorderWidth,
    borderColor: Theme.buttonPrimaryBorder,
  },
  bidCtaText: { fontSize: 12, fontWeight: "700", color: Theme.buttonPrimaryText },
  notYetBiddable: { fontSize: 11, color: Theme.textMuted, fontStyle: "italic" },
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
  feePreviewBlock: {
    borderRadius: 10,
    backgroundColor: Theme.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 8,
    gap: 6,
  },
  feePreviewRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  feePreviewLabel: { fontSize: 12, fontWeight: "500", color: Theme.textSecondary },
  feePreviewValue: { fontSize: 13, fontWeight: "700", color: Theme.textPrimaryDark },
  feePreviewNote: { fontSize: 11, fontWeight: "400", color: Theme.textMuted, lineHeight: 15 },
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
