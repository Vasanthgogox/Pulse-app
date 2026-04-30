/**
 * Trip card with expand/collapse to show ASSOCIATED TRIP, Supplier Cost/Paid/Due,
 * ASSIGNMENTS (with reassign/change driver & vehicle), and ASSOCIATED TRANSACTIONS inline.
 * Matches trip detail Finance view; includes TripAssignmentBlock when expanded.
 */
import Theme from "@/constants/Theme";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { getDriverById } from "@/features/drivers/services/drivers.service";
import type { LedgerRow } from "@/features/finance/services/finance.service";
import {
  getSupplierById,
  getSupplierDetails,
} from "@/features/suppliers/services/suppliers.service";
import { getVehicleById } from "@/features/vehicles/services/vehicles.service";
import { canAssignTrip, getCapabilitiesFromProfile } from "@/lib/capabilities";
import { formatINR } from "@/lib/format";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { getTripAssignmentAuditHistory } from "../services/trip-assignment-audit.service";
import type { TripAssignmentAuditRow } from "../services/trip-assignment-audit.service";
import { getTripDisplayNumber, type TripRow } from "../services/trips.service";
import { getTripOtpForDisplay } from "../services/tripOtp.service";
import { TripAssignmentBlock, type AssignmentSource } from "./TripAssignmentBlock";
import { TripDetailFinanceView } from "./trip-detail/TripDetailFinanceView";

export interface TripExpandableCardProps {
  trip: TripRow;
  /** Ledger entries for this trip (filtered by trip_id). */
  tripLedgerEntries: LedgerRow[];
  /** Display date string (e.g. from getTripCardDate). */
  cardDate: string;
  /** Stage label (e.g. ACTIVE, COMPLETED). */
  stage: string;
  /** Whether trip is aggregate (assign-by-phone). */
  isAggregate: boolean;
  /** Optional driver name for ASSOCIATED TRIP block. */
  driverName?: string | null;
  /** Optional vehicle label (formatted) for ASSOCIATED TRIP block. */
  vehicleLabel?: string | null;
  /** When provided, show "View full trip" in expanded section and call on press. */
  onViewFullTrip?: (tripId: string) => void;
  /** When provided, called after assignment/reassignment so parent can refetch list. */
  onAssignmentUpdated?: () => void;
  /** When provided, card tap navigates to trip detail (e.g. new page) and no inline expand/detail is shown. */
  onPress?: () => void;
  /** When provided (e.g. supplier view: shipper name), overrides trip.client_name for "Client" display. */
  displayClientName?: string | null;
}

export function TripExpandableCard({
  trip,
  tripLedgerEntries,
  cardDate,
  stage,
  isAggregate,
  driverName,
  vehicleLabel,
  onViewFullTrip,
  onAssignmentUpdated,
  onPress: onPressProp,
  displayClientName: displayClientNameProp,
}: TripExpandableCardProps) {
  const displayClientName = displayClientNameProp ?? trip.client_name ?? "—";
  const { t } = useLanguage();
  const [expanded, setExpanded] = useState(false);
  const router = useRouter();
  /** When onPress is provided, card opens detail in new page; no inline expand. */
  const opensNewPage = !!onPressProp;
  const { profile, user } = useAuth();

  const capabilities = useMemo(
    () =>
      getCapabilitiesFromProfile(
        profile ? { role: profile.role, aggregated: profile.aggregated, asset: profile.asset } : null,
      ),
    [profile],
  );
  const canAssign = canAssignTrip(capabilities);
  const currentUserId = user?.uid ?? null;
  const { currentOrganization } = useOrganization();
  /** Roster flow from Load Hub: driver + vehicle set at create — asset-based; do not show OTP/assign-by-phone. */
  const isRosterFromLoadHub =
    trip?.source === "direct_quote" &&
    trip?.driver_id != null &&
    trip?.vehicle_id != null;
  const showAssignByPhone = isAggregate && !isRosterFromLoadHub;
  /** For UI pill: show "Asset" when roster-from-LoadHub (asset-based assignment) or when no supplier. */
  const displayAsAsset = !isAggregate || isRosterFromLoadHub;
  /** Load creator (shipper) flag — trip-based flow keeps full assignment/OTP controls, so this is informational only. */
  const isLoadCreatorViewOnly =
    !!currentOrganization?.id &&
    !!trip?.organization_id &&
    !!trip?.supplier_id &&
    currentOrganization.id === trip.organization_id;
  /** Non-owner + indent: supplier_rate (we're the supplier). Otherwise: client_price (owner/shipper or non-indent). */
  const isOwner =
    currentOrganization?.id != null &&
    trip.organization_id != null &&
    trip.organization_id === currentOrganization.id;
  const cardRevenue =
    trip.indent_id != null && !isOwner
      ? Number(trip.supplier_rate ?? 0)
      : Number(trip.client_price ?? 0);

  const [assignmentAuditRows, setAssignmentAuditRows] = useState<TripAssignmentAuditRow[]>([]);
  const [assignmentDriverNames, setAssignmentDriverNames] = useState<Record<string, string>>({});
  const [assignmentVehicleLabels, setAssignmentVehicleLabels] = useState<Record<string, string>>({});
  const [tripOtp, setTripOtp] = useState<{ code: string | null; expires_at: string | null } | null>(null);
  const [partnerName, setPartnerName] = useState<string | null>(null);
  const [displayVehicleFromInput, setDisplayVehicleFromInput] = useState("");

  const loadAssignmentAudit = useCallback(() => {
    if (!trip.id) return;
    getTripAssignmentAuditHistory(trip.id).then(({ error, rows }) => {
      if (!error) setAssignmentAuditRows(rows ?? []);
      else setAssignmentAuditRows([]);
    });
  }, [trip.id]);

  const loadTripOtp = useCallback(() => {
    // Aggregate trips (supplier_id present) can show an OTP.
    // For Own/Load-based labeling we rely on the parent-provided `isAggregate` (trimmed supplier_id).
    if (!trip.id || !isAggregate) {
      setTripOtp(null);
      return;
    }
    getTripOtpForDisplay(trip.id).then(({ error, code, expires_at }) => {
      if (error) setTripOtp(null);
      else setTripOtp({ code: code ?? null, expires_at: expires_at ?? null });
    });
  }, [trip.id, isAggregate]);

  useEffect(() => {
    if (!expanded || !trip.organization_id) return;
    loadAssignmentAudit();
    // Roster-from-LoadHub is treated as asset/own in the UI; don't fetch OTP for it.
    if (showAssignByPhone) loadTripOtp();
    else setTripOtp(null);
  }, [expanded, trip.organization_id, showAssignByPhone, loadAssignmentAudit, loadTripOtp]);

  useEffect(() => {
    if (!expanded || !trip.organization_id || assignmentAuditRows.length === 0) {
      setAssignmentDriverNames({});
      setAssignmentVehicleLabels({});
      return;
    }
    const driverIds = new Set<string>();
    const vehicleIds = new Set<string>();
    for (const row of assignmentAuditRows) {
      if (row.driver_id_prev) driverIds.add(row.driver_id_prev);
      if (row.driver_id_new) driverIds.add(row.driver_id_new);
      if (row.vehicle_id_prev) vehicleIds.add(row.vehicle_id_prev);
      if (row.vehicle_id_new) vehicleIds.add(row.vehicle_id_new);
    }
    let cancelled = false;
    const driverPromises = Array.from(driverIds).map(async (id) => {
      const res = await getDriverById(trip.organization_id!, id);
      return { id, name: res.driver ? (res.driver.name || res.driver.phone || "").trim() : "" };
    });
    const vehiclePromises = Array.from(vehicleIds).map(async (id) => {
      const res = await getVehicleById(trip.organization_id!, id);
      const label = res.vehicle
        ? [res.vehicle.vehicle_number, res.vehicle.vehicle_type].filter(Boolean).join(" · ") || id
        : id;
      return { id, label };
    });
    Promise.all([Promise.all(driverPromises), Promise.all(vehiclePromises)])
      .then(([driverResults, vehicleResults]) => {
        if (cancelled) return;
        const drivers: Record<string, string> = {};
        const vehicles: Record<string, string> = {};
        for (const r of driverResults) {
          if (r.name) drivers[r.id] = r.name;
        }
        for (const r of vehicleResults) vehicles[r.id] = r.label;
        setAssignmentDriverNames(drivers);
        setAssignmentVehicleLabels(vehicles);
      })
      .catch(() => {
        if (!cancelled) {
          setAssignmentDriverNames({});
          setAssignmentVehicleLabels({});
        }
      });
    return () => {
      cancelled = true;
    };
  }, [expanded, trip.organization_id, assignmentAuditRows]);

  useEffect(() => {
    if (!expanded || !trip.supplier_id || !trip.organization_id) {
      setPartnerName(null);
      return;
    }
    let cancelled = false;
    const supplierId = trip.supplier_id;
    const ownerOrgId = trip.organization_id;
    const fallback = (trip.supplier_name ?? "").trim() || null;
    const pick = (
      s: { company_name?: string | null; name?: string | null; contact_person?: string | null } | null,
    ) => (s?.company_name || s?.name || s?.contact_person || "").trim() || null;

    void (async () => {
      const { supplier: fromRpc } = await getSupplierDetails(supplierId);
      if (cancelled) return;
      const n = pick(fromRpc);
      if (n) {
        setPartnerName(n);
        return;
      }
      const { supplier: fromOwner, error: errOwner } = await getSupplierById(ownerOrgId, supplierId);
      if (cancelled) return;
      if (!errOwner) {
        const n2 = pick(fromOwner);
        if (n2) {
          setPartnerName(n2);
          return;
        }
      }
      const viewerOrgId = currentOrganization?.id;
      if (viewerOrgId && viewerOrgId !== ownerOrgId) {
        const { supplier: fromViewer, error: errViewer } = await getSupplierById(viewerOrgId, supplierId);
        if (cancelled) return;
        if (!errViewer) {
          const n3 = pick(fromViewer);
          if (n3) {
            setPartnerName(n3);
            return;
          }
        }
      }
      setPartnerName(fallback);
    })();

    return () => {
      cancelled = true;
    };
  }, [expanded, trip.organization_id, trip.supplier_id, trip.supplier_name, currentOrganization?.id]);

  const assignmentSource = useMemo((): AssignmentSource => {
    const latest = assignmentAuditRows[0];
    if (!latest) return "unassigned";
    return latest.changed_by === currentUserId ? "private" : "shared";
  }, [assignmentAuditRows, currentUserId]);

  const latestReassignmentRow = useMemo(
    () => assignmentAuditRows.find((r) => r.event_type === "reassignment"),
    [assignmentAuditRows],
  );
  const previousDriverName = useMemo(() => {
    if (!latestReassignmentRow?.driver_id_prev) return null;
    return assignmentDriverNames[latestReassignmentRow.driver_id_prev] ?? null;
  }, [latestReassignmentRow, assignmentDriverNames]);
  const latestReassignmentSummary = useMemo(() => {
    if (!latestReassignmentRow) return null;
    const parts: string[] = [];
    const driverPrev = latestReassignmentRow.driver_id_prev
      ? assignmentDriverNames[latestReassignmentRow.driver_id_prev]
      : null;
    const driverNew = latestReassignmentRow.driver_id_new
      ? assignmentDriverNames[latestReassignmentRow.driver_id_new]
      : null;
    const vehiclePrev = latestReassignmentRow.vehicle_id_prev
      ? assignmentVehicleLabels[latestReassignmentRow.vehicle_id_prev]
      : null;
    const vehicleNew = latestReassignmentRow.vehicle_id_new
      ? assignmentVehicleLabels[latestReassignmentRow.vehicle_id_new]
      : null;
    if (driverPrev != null && driverNew != null) parts.push(`Driver: ${driverPrev} → ${driverNew}`);
    else if (driverNew != null) parts.push(`Driver: ${driverNew}`);
    else if (driverPrev != null) parts.push(`Driver: ${driverPrev} (rejected)`);
    if (vehiclePrev != null && vehicleNew != null) parts.push(`Vehicle: ${vehiclePrev} → ${vehicleNew}`);
    else if (vehicleNew != null) parts.push(`Vehicle: ${vehicleNew}`);
    else if (vehiclePrev != null) parts.push(`Vehicle: ${vehiclePrev} (rejected)`);
    if (latestReassignmentRow.changed_at) {
      try {
        parts.push(
          new Date(latestReassignmentRow.changed_at).toLocaleDateString("en-IN", {
            day: "2-digit",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          }),
        );
      } catch {
        parts.push(latestReassignmentRow.changed_at.slice(0, 16));
      }
    }
    return parts.length > 0 ? parts.join("\n") : null;
  }, [latestReassignmentRow, assignmentDriverNames, assignmentVehicleLabels]);

  const handleAssignmentUpdated = useCallback(() => {
    loadAssignmentAudit();
    if (trip.supplier_id) loadTripOtp();
    onAssignmentUpdated?.();
  }, [loadAssignmentAudit, loadTripOtp, trip.supplier_id, onAssignmentUpdated]);

  const effectiveVehicleLabel =
    isAggregate && displayVehicleFromInput.trim()
      ? displayVehicleFromInput.trim()
      : (vehicleLabel ?? null);

  const handleViewFullTrip = () => {
    if (onViewFullTrip) {
      onViewFullTrip(trip.id);
    } else {
      router.push(`/trip/${trip.id}`);
    }
  };

  const isActive = stage !== "COMPLETED" && stage !== "DELIVERED" && stage !== "DONE";
  const trackingStep = (() => {
    const s = (trip.status ?? "").toLowerCase();
    if (s === "completed" || s === "delivered") return 4;
    if (s === "in_progress" || s === "in transit") return 3;
    if (trip.started_at) return 2;
    if (trip.driver_id || s === "assigned") return 1;
    return 0;
  })();
  const missionStatus = (() => {
    const s = (trip.status ?? "").trim().toLowerCase();
    if (!s) return "Pending";
    if (s === "in_progress") return "Loading";
    if (s === "in_transit" || s === "in transit") return "In Transit";
    if (s === "at_destination" || s === "at_drop") return "At Destination";
    if (s === "completed" || s === "delivered" || s === "done") return "Completed";
    return s
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  })();
  const segmentFilled = (segmentIndex: number) => trackingStep >= segmentIndex + 1;

  return (
    <View style={styles.wrap}>
      <Pressable
        style={styles.card}
        onPress={opensNewPage ? onPressProp : () => setExpanded((e) => !e)}
        accessibilityLabel={
          opensNewPage
            ? `${getTripDisplayNumber(trip)} Open trip details`
            : `${getTripDisplayNumber(trip)} ${expanded ? "Collapse" : "Expand"} trip details`
        }
        accessibilityRole="button"
      >
        <View style={styles.cardTop}>
          <View style={styles.cardTopLeft}>
            <View style={styles.cardIdPill}>
              <Text style={styles.cardIdPillText}>
                #{getTripDisplayNumber(trip)}
                {trip.indent_number ? ` · ${trip.indent_number}` : ""}
              </Text>
            </View>
            <View
              style={[
                styles.sourcePill,
                displayAsAsset ? styles.sourcePillAsset : styles.sourcePillAggregate,
              ]}
            >
              <Text
                style={[
                  styles.sourcePillText,
                  displayAsAsset ? styles.sourcePillTextAsset : styles.sourcePillTextAggregate,
                ]}
              >
                {displayAsAsset ? "TRIP TYPE" : "SUPPLY SOURCE"}
              </Text>
            </View>
            <View
              style={[
                styles.sourcePill,
                isAggregate ? styles.sourcePillLoadBased : styles.sourcePillOwn,
              ]}
            >
              <Text
                style={[
                  styles.sourcePillText,
                  isAggregate ? styles.sourcePillTextLoadBased : styles.sourcePillTextOwn,
                ]}
              >
                {displayAsAsset
                  ? trip.driver_id
                    ? "Asset aggregate with driver"
                    : "Asset aggregate"
                  : isAggregate
                    ? "Partner Load"
                    : "Own"}
              </Text>
            </View>
            {isActive && (
              <View style={styles.livePill}>
                <View style={styles.liveDot} />
                <Text style={styles.livePillText}>LIVE</Text>
              </View>
            )}
            <Text style={styles.cardClient} numberOfLines={1}>
              {(displayClientName || "—").toUpperCase()}
            </Text>
          </View>
          <View style={styles.cardTopRight}>
            <View style={styles.cardTopRightCol}>
              <View style={styles.stagePill}>
                <Text style={styles.stagePillText}>{stage}</Text>
              </View>
              <Text style={styles.cardRef}>Ref: {cardDate}</Text>
            </View>
            <FontAwesome
              name={opensNewPage ? "chevron-right" : expanded ? "chevron-down" : "chevron-right"}
              size={12}
              color={Theme.textMuted}
              style={styles.chevronWrap}
            />
          </View>
        </View>
        <View style={styles.cardRouteBlock}>
          <View style={styles.cardRouteRow}>
            <View style={styles.cardRouteLeft}>
              <View style={styles.cardRouteIconWrap}>
                <FontAwesome name="map-marker" size={14} color={Theme.primary} />
              </View>
              <View style={styles.cardRouteLabels}>
                <Text style={styles.cardRouteLabel}>MANIFEST ROUTE</Text>
                <View style={styles.cardRouteOriginDest}>
                  <Text style={styles.cardRouteValue} numberOfLines={1}>{trip.pickup_area ?? "—"}</Text>
                  <FontAwesome name="arrow-right" size={10} color={Theme.primary} style={styles.cardRouteArrow} />
                  <Text style={styles.cardRouteValue} numberOfLines={1}>{trip.drop_location ?? "—"}</Text>
                </View>
              </View>
            </View>
            <View style={styles.cardRevenueWrap}>
              <Text style={styles.cardRevenueLabel}>REVENUE</Text>
              <Text style={styles.cardRevenueValue}>{formatINR(cardRevenue)}</Text>
            </View>
          </View>
          <View style={styles.cardProgressWrap}>
            <View style={styles.cardProgressLabels}>
              <Text style={styles.cardProgressLabel}>MISSION STATUS</Text>
              <Text style={styles.cardProgressStatus}>{missionStatus}</Text>
            </View>
            <View style={styles.cardProgressSegmentRow}>
              {[0, 1, 2, 3].map((i) => (
                <View
                  key={i}
                  style={[
                    styles.cardProgressSegment,
                    segmentFilled(i)
                      ? styles.cardProgressSegmentFilled
                      : styles.cardProgressSegmentEmpty,
                  ]}
                />
              ))}
            </View>
          </View>
        </View>
      </Pressable>

      {!opensNewPage && expanded && (
        <View style={styles.expandedContent}>
          <TripDetailFinanceView
            trip={trip}
            tripLedgerEntries={tripLedgerEntries}
            viewerOrgId={currentOrganization?.id ?? null}
            viewerOrganizationName={currentOrganization?.name ?? null}
            driverName={driverName ?? undefined}
            vehicleLabel={effectiveVehicleLabel ?? vehicleLabel ?? undefined}
            assignmentAuditRows={assignmentAuditRows}
            assignmentDriverNames={assignmentDriverNames}
            assignmentVehicleLabels={assignmentVehicleLabels}
            tripOtp={tripOtp}
            partnerName={partnerName}
            currentUserId={currentUserId}
            assignmentBlock={
              trip.organization_id ? (
                <TripAssignmentBlock
                  trip={trip}
                  organizationId={trip.organization_id}
                  canAssign={canAssign}
                  onUpdated={handleAssignmentUpdated}
                  driverName={driverName ?? undefined}
                  vehicleLabel={effectiveVehicleLabel ?? vehicleLabel ?? undefined}
                  partnerName={isAggregate ? partnerName ?? undefined : undefined}
                  assignmentSource={assignmentSource}
                  currentUserId={currentUserId}
                  showAssignByPhone={showAssignByPhone}
                  onVehicleDisplayChange={setDisplayVehicleFromInput}
                  previousDriverName={previousDriverName}
                  latestReassignmentSummary={latestReassignmentSummary}
                  viewOnly={false}
                  driverAssignOrgId={showAssignByPhone ? currentOrganization?.id ?? undefined : undefined}
                />
              ) : null
            }
          />
          <TouchableOpacity
            style={styles.viewFullTripBtn}
            onPress={handleViewFullTrip}
            activeOpacity={0.7}
          >
            <Text style={styles.viewFullTripText}>{t("viewFullTrip")}</Text>
            <FontAwesome name="chevron-right" size={10} color={Theme.primary} />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const TESLA_BLACK = "#171A20";

const styles = StyleSheet.create({
  wrap: { marginBottom: 12 },
  card: {
    borderWidth: 1,
    borderColor: Theme.surfaceBorder,
    borderRadius: 20,
    padding: 16,
    backgroundColor: Theme.screenBackground,
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
    overflow: "hidden",
  },
  cardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  cardTopLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
    minWidth: 0,
  },
  cardIdPill: {
    backgroundColor: Theme.primary,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  cardIdPillText: {
    fontSize: 7,
    fontWeight: "600",
    color: Theme.screenBackground,
    letterSpacing: 0.5,
  },
  sourcePill: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  sourcePillAsset: {
    backgroundColor: Theme.primarySoft,
    borderColor: Theme.primary,
  },
  sourcePillAggregate: {
    backgroundColor: Theme.primarySoft,
    borderColor: Theme.primary,
  },
  sourcePillText: {
    fontSize: 6,
    fontWeight: "600",
    letterSpacing: 0.3,
  },
  sourcePillTextAsset: { color: Theme.primary },
  sourcePillTextAggregate: { color: Theme.primary },
  sourcePillOwn: {
    backgroundColor: Theme.surfaceGray,
    borderColor: Theme.primary,
  },
  sourcePillLoadBased: {
    backgroundColor: Theme.surfaceGray,
    borderColor: Theme.darkGreen,
  },
  sourcePillTextOwn: { color: Theme.primary },
  sourcePillTextLoadBased: { color: Theme.darkGreen },
  livePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 3,
    backgroundColor: Theme.surfaceGray,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Theme.surfaceBorder,
  },
  liveDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: Theme.teslaRed,
  },
  livePillText: {
    fontSize: 6,
    fontWeight: "800",
    color: Theme.teslaRed,
    letterSpacing: 0.3,
  },
  cardClient: {
    fontSize: 11,
    fontWeight: "600",
    color: TESLA_BLACK,
    flex: 1,
    minWidth: 0,
    textTransform: "uppercase",
  },
  cardTopRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  cardTopRightCol: {
    alignItems: "flex-end",
  },
  stagePill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: Theme.primary,
  },
  stagePillText: {
    fontSize: 7,
    fontWeight: "600",
    color: Theme.textOnPrimary,
    letterSpacing: 0.5,
  },
  cardRef: {
    fontSize: 6,
    fontWeight: "500",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 2,
    width: "100%",
    textAlign: "right",
  },
  chevronWrap: { marginLeft: 4 },
  cardRouteBlock: {
    backgroundColor: Theme.screenBackground,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    marginBottom: 0,
  },
  cardRouteRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  cardRouteLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    minWidth: 0,
    marginRight: 8,
  },
  cardRouteIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Theme.screenBackground,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
    borderWidth: 1,
    borderColor: Theme.surfaceBorder,
  },
  cardRouteLabels: { flex: 1, minWidth: 0 },
  cardRouteLabel: {
    fontSize: 6,
    fontWeight: "500",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  cardRouteOriginDest: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  cardRouteValue: {
    fontSize: 10,
    fontWeight: "600",
    color: TESLA_BLACK,
    flex: 1,
    minWidth: 0,
    textTransform: "uppercase",
  },
  cardRouteArrow: { marginHorizontal: 2 },
  cardRevenueWrap: { alignItems: "flex-end" },
  cardRevenueLabel: {
    fontSize: 6,
    fontWeight: "500",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  cardRevenueValue: {
    fontSize: 13,
    fontWeight: "600",
    color: TESLA_BLACK,
  },
  cardProgressWrap: { marginTop: 6 },
  cardProgressLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
    paddingHorizontal: 0,
  },
  cardProgressLabel: {
    fontSize: 6,
    fontWeight: "600",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  cardProgressStatus: {
    fontSize: 7,
    fontWeight: "700",
    color: Theme.primary,
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  cardProgressSegmentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  cardProgressSegment: {
    flex: 1,
    height: 2,
    borderRadius: 2,
  },
  cardProgressSegmentFilled: {
    backgroundColor: Theme.positiveMuted,
  },
  cardProgressSegmentEmpty: {
    backgroundColor: Theme.surfaceBorder,
  },
  expandedContent: {
    marginTop: -4,
    marginBottom: 4,
    paddingTop: 8,
    paddingHorizontal: 16,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.screenBackground,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  viewFullTripBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 6,
    paddingVertical: 12,
    paddingBottom: 16,
  },
  viewFullTripText: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.primary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
});
