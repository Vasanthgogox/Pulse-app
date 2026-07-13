/**
 * Mobile trips hub — MakeMyTrip “My Trips” ticket card (single white surface, no nested panels).
 */
import { PartyAvatar } from "@/components/PartyAvatar";
import { FinanceTxnTypography } from "@/constants/FinanceTxnTypography";
import Theme from "@/constants/Theme";
import { TripHubInTransitPingLines } from "@/features/trips/components/TripHubInTransitPingLines";
import type { TripHubInTransitPingMeta } from "@/features/trips/hooks/useTripHubInTransitPings";
import {
  getTripDisplayNumber,
  type TripRow,
} from "@/features/trips/services/trips.service";
import {
  HUB_GRID_CARD_MIN_HEIGHT,
  HUB_GRID_DIVIDER_MARGIN_BOTTOM,
  HUB_GRID_DIVIDER_MARGIN_TOP,
  HUB_CARD_HEAD_AVATAR,
  HUB_CARD_PARTY_CHIP_AVATAR,
  HUB_CARD_HEAD_LEFT_GAP,
  HUB_GRID_HEAD_MARGIN_BOTTOM,
  HUB_GRID_PARTY_MIN_HEIGHT,
  HUB_GRID_ROUTE_MIN_HEIGHT,
} from "@/components/hub/hubGridCardLayout";
import { splitHubRouteLocationDisplay } from "@/features/trips/utils/tripLocationDisplay.util";
import { formatIndianVehicleNumber } from "@/lib/format";
import type { ReactNode } from "react";
import { memo } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import {
  HUB_MOBILE_LIST_CANVAS_BG,
  HUB_MOBILE_TICKET_REF,
  HubMobileListCanvas,
  hubMobileListCanvasStyles,
} from "@/components/hub";

/** Page/list strip — transparent (cards provide their own white surface). */
export const MOBILE_TRIP_CANVAS_BG = HUB_MOBILE_LIST_CANVAS_BG;

const REF = HUB_MOBILE_TICKET_REF;
const ROUTE_ARROW_TOP = 2;
const ROUTE_PIN_SIZE = 8;
const CHIP_AVATAR = HUB_CARD_PARTY_CHIP_AVATAR;

function asLabel(value: unknown): string {
  if (value == null) return "—";
  const s = String(value).trim();
  return s || "—";
}

/** Asset label under client only; supplier/driver use the chip row. */
export function mobileTripClientSubline(isAssetTrip: boolean, typeLabel: string): string | null {
  if (!isAssetTrip) return null;
  const type = asLabel(typeLabel);
  return type === "—" ? null : type;
}

/** Left party chip on asset trips — assigned vehicle plate, not the ASSET type label. */
export function mobileTripAssetVehicleChipLabel(
  trip: Pick<TripRow, "vehicle_display_number">,
  unassignedLabel: string,
): string {
  const formatted = formatIndianVehicleNumber(
    trip.vehicle_display_number ?? "",
  ).trim();
  if (formatted) return formatted;
  const raw = String(trip.vehicle_display_number ?? "").trim();
  if (raw) return raw;
  return unassignedLabel;
}

export function mobileTripSupplierChipLabel(
  options: {
    isAssetTrip: boolean;
    typeLabel: string;
    supplierName?: string;
    showSupplierParty?: boolean;
    awaitingLabel: string;
    trip?: Pick<TripRow, "vehicle_display_number">;
    vehicleUnassignedLabel?: string;
  },
): string {
  if (options.isAssetTrip && options.trip) {
    return mobileTripAssetVehicleChipLabel(
      options.trip,
      options.vehicleUnassignedLabel ?? options.awaitingLabel,
    );
  }
  if (options.isAssetTrip) return asLabel(options.typeLabel);
  if (options.showSupplierParty) {
    const supplier = asLabel(options.supplierName);
    if (supplier !== "—") return supplier;
    return options.awaitingLabel;
  }
  return asLabel(options.typeLabel);
}

export function mobileTripDriverChipLabel(
  trip: TripRow,
  displayDriverName: string | undefined,
  unassignedLabel: string,
): string {
  const resolved = asLabel(displayDriverName);
  if (resolved !== "—" && !/^driver$/i.test(resolved.trim())) return resolved;
  const fromTrip = asLabel(trip.driver_display_name);
  if (fromTrip !== "—" && !/^driver$/i.test(fromTrip.trim())) return fromTrip;
  return unassignedLabel;
}

function formatPartyName(value: string): string {
  return asLabel(value).toUpperCase();
}

function PartyChip({
  name,
  entityType,
  avatarUrl,
  avatarSeed,
  initialsColorSeed,
  organizationImageUrl,
  organizationAvatarSeed,
  alignEnd,
}: {
  name: string;
  entityType: "supplier" | "driver";
  avatarUrl?: string | null;
  avatarSeed?: string | null;
  initialsColorSeed?: string;
  organizationImageUrl?: string | null;
  organizationAvatarSeed?: string | null;
  alignEnd?: boolean;
}) {
  const label = formatPartyName(name);

  return (
    <View style={[styles.chip, alignEnd && styles.chipEnd]}>
      <PartyAvatar
        name={label}
        initialsColorSeed={initialsColorSeed}
        organizationImageUrl={organizationImageUrl}
        organizationAvatarSeed={organizationAvatarSeed}
        avatarUrl={avatarUrl}
        avatarSeed={avatarSeed}
        entityType={entityType}
        size={CHIP_AVATAR}
      />
      <Text
        style={[styles.chipName, alignEnd && styles.chipNameEnd]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
  );
}

export { splitTripLocationParts } from "@/features/trips/utils/tripLocationDisplay.util";

export function formatMobileTripSchedule(iso: string | null | undefined): {
  time: string;
  dateLine: string;
} {
  const raw = iso?.trim();
  if (!raw) return { time: "—", dateLine: "—" };
  try {
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return { time: "—", dateLine: "—" };
    return {
      time: d.toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }),
      dateLine: d.toLocaleDateString("en-IN", {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "2-digit",
      }),
    };
  } catch {
    return { time: "—", dateLine: "—" };
  }
}

/** @deprecated Use `HubMobileListCanvas` from `@/components/hub`. */
export function TripsHubMobileTripListCanvas({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <HubMobileListCanvas style={style}>{children}</HubMobileListCanvas>;
}

function RoutePin({ variant }: { variant: "origin" | "dest" }) {
  return (
    <View
      style={[
        styles.routePin,
        variant === "origin" ? styles.routePinOrigin : styles.routePinDest,
      ]}
    />
  );
}

function RouteLeg({
  location,
  variant,
  align,
  dense,
}: {
  location: string;
  variant: "origin" | "dest";
  align: "left" | "right";
  dense?: boolean;
}) {
  const { city, state } = splitHubRouteLocationDisplay(location);
  const end = align === "right";
  return (
    <View style={[styles.leg, end && styles.legEnd]}>
      <View style={[styles.legRow, end && styles.legRowEnd]}>
        {!end ? <RoutePin variant={variant} /> : null}
        <View style={[styles.legText, end && styles.legTextEnd]}>
          <Text
            style={[
              styles.legCity,
              dense && styles.legCityDense,
              end && styles.textEnd,
            ]}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {asLabel(city)}
          </Text>
          <Text
            style={[
              styles.legState,
              dense && styles.legStateDense,
              end && styles.textEnd,
              !state && styles.legStatePlaceholder,
            ]}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {state || "\u00a0"}
          </Text>
        </View>
        {end ? <RoutePin variant={variant} /> : null}
      </View>
    </View>
  );
}

export type TripsHubMobileTripCardProps = {
  trip: TripRow;
  displayClientName: string;
  displaySupplierName?: string;
  displayDriverName?: string;
  clientAvatarUrl?: string | null;
  clientAvatarSeed?: string | null;
  clientAvatarFallbackSeed?: string;
  clientOrganizationImageUrl?: string | null;
  clientOrganizationAvatarSeed?: string | null;
  supplierAvatarUrl?: string | null;
  supplierAvatarSeed?: string | null;
  supplierAvatarFallbackSeed?: string;
  supplierOrganizationImageUrl?: string | null;
  supplierOrganizationAvatarSeed?: string | null;
  driverAvatarUrl?: string | null;
  driverAvatarSeed?: string | null;
  driverAvatarFallbackSeed?: string;
  stageLabel: string;
  /** Hub asset vs aggregate pill (`tripAsset` / `tripAggregate`). */
  isAssetTrip?: boolean;
  typeLabel?: string;
  showSupplierParty?: boolean;
  missionStatus?: string;
  pickupIso?: string | null;
  origin: string;
  dest: string;
  onPress: () => void;
  tr: (key: string) => string;
  /** Footer slot (grid toolbar) — outside pressable body. */
  actions?: ReactNode;
  dense?: boolean;
  fillGrid?: boolean;
  style?: StyleProp<ViewStyle>;
  /** Viewer org id — used to show BKG ref instead of TRP001 for cross-org supplier trips. */
  viewerOrgId?: string | null;
  /** Last ping time / offline for in-transit trips (no location line). */
  inTransitPing?: TripHubInTransitPingMeta | null;
};

export const TripsHubMobileTripCard = memo(function TripsHubMobileTripCard({
  trip,
  displayClientName,
  displaySupplierName = "",
  displayDriverName = "",
  clientAvatarUrl,
  clientAvatarSeed,
  clientAvatarFallbackSeed,
  clientOrganizationImageUrl,
  clientOrganizationAvatarSeed,
  supplierAvatarUrl,
  supplierAvatarSeed,
  supplierAvatarFallbackSeed,
  supplierOrganizationImageUrl,
  supplierOrganizationAvatarSeed,
  driverAvatarUrl,
  driverAvatarSeed,
  driverAvatarFallbackSeed,
  stageLabel,
  isAssetTrip = false,
  typeLabel = "",
  showSupplierParty = false,
  pickupIso,
  origin,
  dest,
  onPress,
  tr,
  actions,
  dense = false,
  fillGrid = false,
  style,
  viewerOrgId,
  inTransitPing,
}: TripsHubMobileTripCardProps) {
  const tripNo = asLabel(getTripDisplayNumber(trip, viewerOrgId));
  const schedule = formatMobileTripSchedule(
    pickupIso ?? trip.pickup_date ?? trip.created_at,
  );
  const clientName = asLabel(displayClientName);
  const resolvedTypeLabel = typeLabel || tr("tripAggregate");
  const clientSubline = mobileTripClientSubline(isAssetTrip, resolvedTypeLabel);
  const supplierChipName = mobileTripSupplierChipLabel({
    isAssetTrip,
    typeLabel: resolvedTypeLabel,
    supplierName: displaySupplierName,
    showSupplierParty,
    awaitingLabel: tr("tripsHubAwaitingData"),
    trip,
    vehicleUnassignedLabel: tr("unassigned"),
  });
  const driverChipName = mobileTripDriverChipLabel(
    trip,
    displayDriverName,
    tr("unassigned"),
  );
  const clientFb =
    (clientAvatarFallbackSeed ?? "").trim() ||
    (trip.client_id
      ? `client-entity:${String(trip.client_id).trim()}`
      : `client-trip:${trip.id}`);
  const supplierFb =
    (supplierAvatarFallbackSeed ?? "").trim() ||
    (trip.supplier_id
      ? `supplier-entity:${String(trip.supplier_id).trim()}`
      : `supplier-trip:${trip.id}`);
  const vehicleFb = trip.vehicle_id
    ? `vehicle-entity:${String(trip.vehicle_id).trim()}`
    : `vehicle-trip:${trip.id}`;
  const leftChipEntityType = isAssetTrip ? "driver" : "supplier";
  const leftChipAvatarUrl = isAssetTrip ? undefined : supplierAvatarUrl;
  const leftChipAvatarSeed = isAssetTrip ? undefined : supplierAvatarSeed;
  const leftChipInitialsSeed = isAssetTrip ? vehicleFb : supplierFb;
  const leftChipOrgImageUrl = isAssetTrip
    ? undefined
    : supplierOrganizationImageUrl;
  const leftChipOrgAvatarSeed = isAssetTrip
    ? undefined
    : supplierOrganizationAvatarSeed;
  const driverFb =
    (driverAvatarFallbackSeed ?? "").trim() ||
    (trip.driver_id
      ? `driver-entity:${String(trip.driver_id).trim()}`
      : `driver-trip:${trip.id}`);
  const stageUpper = asLabel(stageLabel).toUpperCase();

  return (
    <View style={[styles.cardWrap, fillGrid && styles.cardWrapGrid, style]}>
      <View
        style={[
          styles.card,
          fillGrid && styles.cardGrid,
          fillGrid && styles.cardGridElevated,
        ]}
      >
        <Pressable
          onPress={onPress}
          style={({ pressed }) => [
            styles.body,
            dense && styles.bodyDense,
            fillGrid && styles.bodyGrid,
            pressed && styles.bodyPressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel={`${tripNo} ${clientName}, ${asLabel(origin)} to ${asLabel(dest)}`}
        >
          <View style={[styles.head, fillGrid && styles.headGrid]}>
            <View style={styles.headLeft}>
              <PartyAvatar
                name={clientName}
                initialsColorSeed={clientFb}
                organizationImageUrl={clientOrganizationImageUrl}
                organizationAvatarSeed={clientOrganizationAvatarSeed}
                avatarUrl={clientAvatarUrl}
                avatarSeed={clientAvatarSeed}
                entityType="client"
                size={HUB_CARD_HEAD_AVATAR}
              />
              <View style={styles.headText}>
                <Text style={styles.brand} numberOfLines={1}>
                  {formatPartyName(clientName)}
                </Text>
                {clientSubline ? (
                  <Text style={styles.partnerSubline} numberOfLines={1}>
                    {formatPartyName(clientSubline)}
                  </Text>
                ) : null}
              </View>
            </View>
            <View style={styles.headMetaCol}>
              <Text style={styles.headMeta} numberOfLines={1}>
                {stageUpper}
              </Text>
              <TripHubInTransitPingLines ping={inTransitPing} />
            </View>
          </View>

          <View
            style={[
              styles.route,
              dense && styles.routeDense,
              fillGrid && styles.routeGrid,
            ]}
          >
            <RouteLeg
              location={origin}
              variant="origin"
              align="left"
              dense={dense || fillGrid}
            />
            <View style={styles.routeMid}>
              <Text style={styles.routeArrow}>→</Text>
            </View>
            <RouteLeg
              location={dest}
              variant="dest"
              align="right"
              dense={dense || fillGrid}
            />
          </View>

          <View style={[styles.divider, fillGrid && styles.dividerGrid]} />

          {fillGrid ? (
            <View style={styles.metaBlockGrid}>
              <View style={styles.metaBlockGridGrow} />
              <View style={styles.refRow}>
                <Text style={styles.refLine} numberOfLines={1}>
                  <Text style={styles.refId}>{tripNo}</Text>
                  <Text style={styles.refMuted}>{` · ${schedule.time} · ${schedule.dateLine}`}</Text>
                </Text>
              </View>
              <View style={[styles.partyRow, styles.partyRowGrid]}>
                <PartyChip
                  name={supplierChipName}
                  entityType={leftChipEntityType}
                  avatarUrl={leftChipAvatarUrl}
                  avatarSeed={leftChipAvatarSeed}
                  initialsColorSeed={leftChipInitialsSeed}
                  organizationImageUrl={leftChipOrgImageUrl}
                  organizationAvatarSeed={leftChipOrgAvatarSeed}
                />
                <PartyChip
                  name={driverChipName}
                  entityType="driver"
                  avatarUrl={driverAvatarUrl}
                  avatarSeed={driverAvatarSeed}
                  initialsColorSeed={driverFb}
                  alignEnd
                />
              </View>
            </View>
          ) : (
            <>
              <View style={styles.refRow}>
                <Text style={styles.refLine} numberOfLines={1}>
                  <Text style={styles.refId}>{tripNo}</Text>
                  <Text style={styles.refMuted}>{` · ${schedule.time} · ${schedule.dateLine}`}</Text>
                </Text>
              </View>
              <View style={styles.partyRow}>
                <PartyChip
                  name={supplierChipName}
                  entityType={leftChipEntityType}
                  avatarUrl={leftChipAvatarUrl}
                  avatarSeed={leftChipAvatarSeed}
                  initialsColorSeed={leftChipInitialsSeed}
                  organizationImageUrl={leftChipOrgImageUrl}
                  organizationAvatarSeed={leftChipOrgAvatarSeed}
                />
                <PartyChip
                  name={driverChipName}
                  entityType="driver"
                  avatarUrl={driverAvatarUrl}
                  avatarSeed={driverAvatarSeed}
                  initialsColorSeed={driverFb}
                  alignEnd
                />
              </View>
            </>
          )}
        </Pressable>
        {actions ? (
          <View style={[styles.actionsSlot, fillGrid && styles.actionsSlotGrid]}>
            {actions}
          </View>
        ) : null}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  list: {
    width: "100%",
    gap: 0,
  },
  cardWrap: {
    ...hubMobileListCanvasStyles.cardWrap,
  },
  cardWrapGrid: {
    flex: 1,
    marginBottom: 0,
    minWidth: 0,
  },
  card: {
    backgroundColor: Theme.cardWhite,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    overflow: "hidden",
    ...Platform.select({
      web: {
        boxShadow: "0 2px 8px rgba(15, 23, 42, 0.05)",
      } as ViewStyle,
      default: {
        shadowColor: "#0f172a",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 6,
        elevation: 1,
      },
    }),
  },
  cardGrid: {
    flex: 1,
    width: "100%",
    minHeight: HUB_GRID_CARD_MIN_HEIGHT,
    flexDirection: "column",
  },
  cardGridElevated: {
    borderRadius: 14,
    borderColor: "rgba(15, 23, 42, 0.08)",
    backgroundColor: Theme.cardWhite,
    ...Platform.select({
      web: {
        boxShadow:
          "0 12px 32px rgba(15, 23, 42, 0.09), 0 2px 8px rgba(15, 23, 42, 0.04)",
      } as ViewStyle,
      default: {
        shadowColor: "#0f172a",
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.09,
        shadowRadius: 16,
        elevation: 3,
      },
    }),
  },
  body: {
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 16,
  },
  bodyDense: {
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 14,
  },
  bodyGrid: {
    flex: 1,
    flexDirection: "column",
    paddingBottom: 12,
  },
  actionsSlot: {
    marginTop: "auto",
    width: "100%",
    minWidth: 0,
  },
  actionsSlotGrid: {
    flexShrink: 0,
    marginTop: 0,
  },
  metaBlockGrid: {
    flex: 1,
    minHeight: 0,
    flexDirection: "column",
  },
  metaBlockGridGrow: {
    flex: 1,
    minHeight: 0,
  },
  bodyPressed: {
    opacity: 0.98,
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 14,
  },
  headGrid: {
    marginBottom: HUB_GRID_HEAD_MARGIN_BOTTOM,
  },
  headLeft: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: HUB_CARD_HEAD_LEFT_GAP,
  },
  headText: {
    flex: 1,
    minWidth: 0,
    minHeight: HUB_CARD_HEAD_AVATAR,
    justifyContent: "center",
  },
  brand: {
    ...FinanceTxnTypography.partyTitle,
    fontSize: 12,
    lineHeight: 15,
    letterSpacing: -0.1,
    fontWeight: "500",
  },
  partnerSubline: {
    ...FinanceTxnTypography.partyTitle,
    marginTop: 2,
    fontSize: 8.5,
    lineHeight: 12,
    color: REF.muted,
    letterSpacing: 0.35,
    fontWeight: "400",
  },
  headMetaCol: {
    flexShrink: 0,
    maxWidth: "42%",
    alignItems: "flex-end",
  },
  headMeta: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "500",
    color: REF.muted,
    textAlign: "right",
    textTransform: "uppercase",
    letterSpacing: 0.25,
  },
  route: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 4,
    width: "100%",
    maxWidth: "100%",
    overflow: "hidden",
  },
  routeDense: {
    gap: 3,
  },
  routeGrid: {
    minHeight: HUB_GRID_ROUTE_MIN_HEIGHT,
    flexShrink: 0,
  },
  leg: {
    flex: 1,
    flexBasis: 0,
    minWidth: 0,
    maxWidth: "48%",
    overflow: "hidden",
  },
  legEnd: {
    alignItems: "flex-end",
  },
  legRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    minWidth: 0,
  },
  legRowEnd: {
    justifyContent: "flex-end",
  },
  legText: {
    flex: 1,
    minWidth: 0,
    overflow: "hidden",
    ...Platform.select({
      web: { width: "100%" } as ViewStyle,
      default: {},
    }),
  },
  legTextEnd: {
    alignItems: "flex-end",
  },
  routePin: {
    width: ROUTE_PIN_SIZE,
    height: ROUTE_PIN_SIZE,
    borderRadius: ROUTE_PIN_SIZE / 2,
    marginTop: 2,
    flexShrink: 0,
  },
  routePinOrigin: {
    backgroundColor: REF.accent,
  },
  routePinDest: {
    backgroundColor: Theme.positive,
  },
  legCity: {
    fontSize: 12,
    fontWeight: "600",
    color: REF.ink,
    letterSpacing: -0.1,
    lineHeight: 15,
    textTransform: "uppercase",
    width: "100%",
  },
  legCityDense: {
    fontSize: 10,
    lineHeight: 13,
  },
  legState: {
    marginTop: 1,
    fontSize: 9,
    fontWeight: "400",
    color: REF.muted,
    lineHeight: 12,
    width: "100%",
  },
  legStateDense: {
    fontSize: 8,
    lineHeight: 11,
  },
  legStatePlaceholder: {
    opacity: 0,
  },
  textEnd: {
    textAlign: "right",
  },
  routeMid: {
    width: 24,
    paddingTop: ROUTE_ARROW_TOP,
    alignItems: "center",
    justifyContent: "flex-start",
    flexShrink: 0,
  },
  routeArrow: {
    fontSize: 16,
    fontWeight: "300",
    color: REF.muted,
    lineHeight: 18,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: REF.hairline,
    marginTop: 12,
    marginBottom: 10,
  },
  dividerGrid: {
    marginTop: HUB_GRID_DIVIDER_MARGIN_TOP,
    marginBottom: HUB_GRID_DIVIDER_MARGIN_BOTTOM,
    flexShrink: 0,
  },
  refRow: {
    minWidth: 0,
  },
  refLine: {
    fontSize: 9,
    lineHeight: 12,
    letterSpacing: 0.05,
  },
  refId: {
    fontSize: 9,
    fontWeight: "500",
    color: REF.inkMid,
    lineHeight: 12,
    fontVariant: ["tabular-nums"],
  },
  refMuted: {
    fontSize: 9,
    fontWeight: "400",
    color: REF.muted,
    lineHeight: 12,
    fontVariant: ["tabular-nums"],
  },
  partyRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginTop: 6,
    minHeight: CHIP_AVATAR,
  },
  partyRowGrid: {
    marginTop: 4,
    minHeight: HUB_GRID_PARTY_MIN_HEIGHT,
    flexShrink: 0,
  },
  chip: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  chipEnd: {
    flexDirection: "row-reverse",
    justifyContent: "flex-start",
  },
  chipName: {
    ...FinanceTxnTypography.partyTitle,
    flex: 1,
    minWidth: 0,
    fontSize: 10,
    lineHeight: 13,
    letterSpacing: -0.1,
    fontWeight: "500",
  },
  chipNameEnd: {
    textAlign: "right",
  },
});
