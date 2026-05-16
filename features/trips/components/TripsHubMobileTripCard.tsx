/**
 * Mobile trips hub — MakeMyTrip “My Trips” ticket card (single white surface, no nested panels).
 */
import { PartyAvatar } from "@/components/PartyAvatar";
import { FinanceTxnTypography } from "@/constants/FinanceTxnTypography";
import Theme from "@/constants/Theme";
import {
  getTripDisplayNumber,
  type TripRow,
} from "@/features/trips/services/trips.service";
import { splitTripLocationDisplay } from "@/features/trips/utils/tripLocationDisplay.util";
import type { ReactNode } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

/** Page/list strip — transparent (cards provide their own white surface). */
export const MOBILE_TRIP_CANVAS_BG = "transparent";

const REF = {
  card: Theme.screenBackground,
  ink: "#1c1c1e",
  inkMid: "#3d4650",
  muted: "#9aa3ad",
  hairline: "#e8ecf0",
  accent: "#1a73e8",
  radius: 16,
} as const;

const ROUTE_ARROW_TOP = 2;
const ROUTE_PIN_SIZE = 8;
const CLIENT_HEAD_AVATAR = 24;
const CHIP_AVATAR = 18;

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

export function mobileTripSupplierChipLabel(
  options: {
    isAssetTrip: boolean;
    typeLabel: string;
    supplierName?: string;
    showSupplierParty?: boolean;
    awaitingLabel: string;
  },
): string {
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
  if (resolved !== "—") return resolved;
  const fromTrip = asLabel(trip.driver_display_name);
  if (fromTrip !== "—") return fromTrip;
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

/** Minimal list wrapper — no background panel. */
export function TripsHubMobileTripListCanvas({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.list, style]}>{children}</View>;
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
}: {
  location: string;
  variant: "origin" | "dest";
  align: "left" | "right";
}) {
  const { city, detail } = splitTripLocationDisplay(location);
  const end = align === "right";
  const cityLabel = asLabel(city);
  return (
    <View style={[styles.leg, end && styles.legEnd]}>
      <View style={[styles.legRow, end && styles.legRowEnd]}>
        {!end ? <RoutePin variant={variant} /> : null}
        <View style={[styles.legText, end && styles.legTextEnd]}>
          <Text style={[styles.legCity, end && styles.textEnd]} numberOfLines={1}>
            {cityLabel}
          </Text>
          {detail ? (
            <Text style={[styles.legDetail, end && styles.textEnd]} numberOfLines={2}>
              {detail}
            </Text>
          ) : null}
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
  subTypeLabel?: string;
  pickupIso?: string | null;
  origin: string;
  dest: string;
  onPress: () => void;
  tr: (key: string) => string;
  style?: StyleProp<ViewStyle>;
};

export function TripsHubMobileTripCard({
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
  style,
}: TripsHubMobileTripCardProps) {
  const tripNo = asLabel(getTripDisplayNumber(trip));
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
  const driverFb =
    (driverAvatarFallbackSeed ?? "").trim() ||
    (trip.driver_id
      ? `driver-entity:${String(trip.driver_id).trim()}`
      : `driver-trip:${trip.id}`);
  const stageUpper = asLabel(stageLabel).toUpperCase();

  return (
    <View style={[styles.cardWrap, style]}>
      <View style={styles.card}>
        <Pressable
          onPress={onPress}
          style={({ pressed }) => [styles.body, pressed && styles.bodyPressed]}
          accessibilityRole="button"
          accessibilityLabel={`${tripNo} ${clientName}, ${asLabel(origin)} to ${asLabel(dest)}`}
        >
          <View style={styles.head}>
            <View style={styles.headLeft}>
              <PartyAvatar
                name={clientName}
                initialsColorSeed={clientFb}
                organizationImageUrl={clientOrganizationImageUrl}
                organizationAvatarSeed={clientOrganizationAvatarSeed}
                avatarUrl={clientAvatarUrl}
                avatarSeed={clientAvatarSeed}
                entityType="client"
                size={CLIENT_HEAD_AVATAR}
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
            <Text style={styles.headMeta} numberOfLines={1}>
              {stageUpper}
            </Text>
          </View>

          <View style={styles.route}>
            <RouteLeg location={origin} variant="origin" align="left" />
            <View style={styles.routeMid}>
              <Text style={styles.routeArrow}>→</Text>
            </View>
            <RouteLeg location={dest} variant="dest" align="right" />
          </View>

          <View style={styles.divider} />

          <View style={styles.refRow}>
            <Text style={styles.refLine} numberOfLines={1}>
              <Text style={styles.refId}>{tripNo}</Text>
              <Text style={styles.refMuted}>{` · ${schedule.time} · ${schedule.dateLine}`}</Text>
            </Text>
          </View>

          <View style={styles.partyRow}>
            <PartyChip
              name={supplierChipName}
              entityType="supplier"
              avatarUrl={supplierAvatarUrl}
              avatarSeed={supplierAvatarSeed}
              initialsColorSeed={supplierFb}
              organizationImageUrl={supplierOrganizationImageUrl}
              organizationAvatarSeed={supplierOrganizationAvatarSeed}
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
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    width: "100%",
    gap: 0,
  },
  cardWrap: {
    width: "100%",
    marginBottom: 12,
  },
  card: {
    backgroundColor: REF.card,
    borderRadius: REF.radius,
    overflow: "hidden",
    ...Platform.select({
      web: {
        boxShadow: "0 2px 12px rgba(15, 23, 42, 0.08)",
      } as ViewStyle,
      default: {
        shadowColor: "#0f172a",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 10,
        elevation: 2,
      },
    }),
  },
  body: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 14,
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
  headLeft: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headText: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
  },
  brand: {
    ...FinanceTxnTypography.partyTitle,
    fontSize: 10,
    lineHeight: 13,
    letterSpacing: -0.1,
    fontWeight: "400",
  },
  partnerSubline: {
    ...FinanceTxnTypography.partyTitle,
    marginTop: 1,
    fontSize: 8,
    lineHeight: 11,
    color: REF.muted,
    letterSpacing: 0.35,
    fontWeight: "400",
  },
  headMeta: {
    flexShrink: 0,
    maxWidth: "40%",
    fontSize: 9,
    lineHeight: 12,
    fontWeight: "400",
    color: REF.muted,
    textAlign: "right",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  route: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 4,
  },
  leg: {
    flex: 1,
    minWidth: 0,
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
    fontSize: 11,
    fontWeight: "900",
    color: REF.ink,
    letterSpacing: -0.15,
    lineHeight: 14,
    textTransform: "uppercase",
  },
  legDetail: {
    marginTop: 1,
    fontSize: 9,
    fontWeight: "400",
    color: REF.muted,
    lineHeight: 12,
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
  refRow: {
    minWidth: 0,
  },
  refLine: {
    fontSize: 8,
    lineHeight: 11,
    letterSpacing: 0.1,
  },
  refId: {
    fontSize: 8,
    fontWeight: "500",
    color: REF.inkMid,
    lineHeight: 11,
    fontVariant: ["tabular-nums"],
  },
  refMuted: {
    fontSize: 8,
    fontWeight: "400",
    color: REF.muted,
    lineHeight: 11,
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
    fontSize: 9,
    lineHeight: 12,
    letterSpacing: -0.15,
    fontWeight: "400",
  },
  chipNameEnd: {
    textAlign: "right",
  },
});
