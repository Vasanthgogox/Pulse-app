/**
 * Shared compact trip sheet visuals — assignment card + active flow card.
 */
import { PartyAvatar } from "@/components/PartyAvatar";
import Theme from "@/constants/Theme";
import type { JobCardAssignerPayload } from "@/lib/driverAssignerDisplay";
import { Clock, MapPin, Navigation, Truck } from "lucide-react-native";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

export const FLOW_EMERALD = Theme.driverEmerald;
export const FLOW_EMERALD_DARK = Theme.driverEmeraldDark;
export const FLOW_MINT = "rgba(167,243,208,0.92)";
/** Matches `DriverInviteModal` sheet top curve. */
export const TRIP_SHEET_TOP_RADIUS = 28;

export function compactRoutePlace(raw: string): string {
  const t = (raw ?? "").trim();
  if (!t || t === "—") return "—";
  const comma = t.indexOf(",");
  return comma > 0 ? t.slice(0, comma).trim() : t;
}

function kindBadgeHeroStyle(kind: JobCardAssignerPayload["kind"]) {
  switch (kind) {
    case "your_fleet":
      return {
        bg: "rgba(255,255,255,0.22)",
        text: "#fff",
        border: "rgba(255,255,255,0.35)",
      };
    case "employer":
      return {
        bg: "rgba(255,255,255,0.18)",
        text: FLOW_MINT,
        border: "rgba(255,255,255,0.28)",
      };
    case "direct":
      return {
        bg: "rgba(254,243,199,0.28)",
        text: "#FEF3C7",
        border: "rgba(254,243,199,0.4)",
      };
    default:
      return {
        bg: "rgba(255,255,255,0.14)",
        text: FLOW_MINT,
        border: "rgba(255,255,255,0.22)",
      };
  }
}

export function HeroKindBadge({
  kind,
  label,
}: {
  kind: JobCardAssignerPayload["kind"];
  label: string;
}) {
  const badge = kindBadgeHeroStyle(kind);
  return (
    <View
      style={[
        sheetStyles.heroKindBadge,
        { backgroundColor: badge.bg, borderColor: badge.border },
      ]}
    >
      <Text style={[sheetStyles.heroKindText, { color: badge.text }]}>{label}</Text>
    </View>
  );
}

export function HeroAssignerBlock({
  assigner,
  assignedByLine,
}: {
  assigner: JobCardAssignerPayload | null;
  assignedByLine?: string | null;
}) {
  if (assigner) {
    const primary = assigner.linePrimary.trim();
    const secondary = assigner.lineSecondary.trim();
    if (!primary && !secondary) return null;

    return (
      <View style={sheetStyles.heroAssignerBlock}>
        <View style={sheetStyles.heroAssignerRow}>
          <PartyAvatar
            name={primary || assigner.orgName || "Fleet"}
            initialsColorSeed={assigner.orgId || assigner.orgName}
            organizationImageUrl={assigner.orgLogoUrl}
            organizationAvatarSeed={assigner.orgAvatarSeed}
            avatarUrl={assigner.orgAvatarUrl}
            entityType="client"
            size={28}
            borderStyle={sheetStyles.heroAvatarBorder}
          />
          <View style={sheetStyles.heroAssignerTextCol}>
            {primary ? (
              <Text style={sheetStyles.heroAssignPrimary} numberOfLines={1}>
                {primary}
              </Text>
            ) : null}
            {secondary ? (
              <Text style={sheetStyles.heroAssignSecondary} numberOfLines={1}>
                {secondary}
              </Text>
            ) : null}
          </View>
        </View>
      </View>
    );
  }

  const line = assignedByLine?.trim();
  if (!line) return null;

  return (
    <View style={sheetStyles.heroAssignerBlock}>
      <Text style={sheetStyles.heroAssignPrimary} numberOfLines={2}>
        {line}
      </Text>
    </View>
  );
}

export function RouteInlineRow({
  pickup,
  dropoff,
  primaryTextColor = Theme.textPrimaryDark,
  mutedTextColor = Theme.textMuted,
  useFullPlace = false,
}: {
  pickup: string;
  dropoff: string;
  primaryTextColor?: string;
  mutedTextColor?: string;
  /** When true, show full place string instead of city-only. */
  useFullPlace?: boolean;
}) {
  const pickupLabel = useFullPlace ? pickup.trim() || "—" : compactRoutePlace(pickup);
  const dropoffLabel = useFullPlace ? dropoff.trim() || "—" : compactRoutePlace(dropoff);

  return (
    <View style={sheetStyles.routeInlineRow}>
      <View style={sheetStyles.routeSide}>
        <View style={sheetStyles.routeDotOrigin} />
        <Text
          style={[sheetStyles.routeCity, { color: primaryTextColor }]}
          numberOfLines={1}
        >
          {pickupLabel}
        </Text>
      </View>
      <Text style={[sheetStyles.routeArrow, { color: mutedTextColor }]}>→</Text>
      <View style={sheetStyles.routeSide}>
        <View style={sheetStyles.routeDotDest}>
          <MapPin size={7} color="#fff" strokeWidth={2.5} />
        </View>
        <Text
          style={[sheetStyles.routeCity, { color: primaryTextColor }]}
          numberOfLines={1}
        >
          {dropoffLabel}
        </Text>
      </View>
    </View>
  );
}

export function TripDetailsStrip({
  statLeft,
  statRight,
  pickup,
  dropoff,
  footer,
  locationLabel,
  primaryTextColor = Theme.textPrimaryDark,
  mutedTextColor = Theme.textMuted,
}: {
  statLeft: string;
  statRight: string;
  pickup: string;
  dropoff: string;
  /** Legacy footer slot — prefer `locationLabel` for location + stats row. */
  footer?: React.ReactNode;
  /** When set, stats move to the bottom row beside live location. */
  locationLabel?: string | null;
  primaryTextColor?: string;
  mutedTextColor?: string;
}) {
  const trimmedLocation = locationLabel?.trim();
  const showLocationStatsRow = !!trimmedLocation;

  const statsEnd = (
    <View style={sheetStyles.statsEndGroup}>
      <View style={sheetStyles.statChipCompact}>
        <Navigation size={9} color={FLOW_EMERALD} strokeWidth={2.2} />
        <Text
          style={[sheetStyles.statValueCompact, { color: primaryTextColor }]}
          numberOfLines={1}
        >
          {statLeft}
        </Text>
      </View>
      <View style={sheetStyles.statSepDot} />
      <View style={sheetStyles.statChipCompact}>
        <Clock size={9} color={FLOW_EMERALD} strokeWidth={2.2} />
        <Text
          style={[sheetStyles.statValueCompact, { color: primaryTextColor }]}
          numberOfLines={1}
        >
          {statRight}
        </Text>
      </View>
    </View>
  );

  return (
    <View style={sheetStyles.tripDetailsCard}>
      {!showLocationStatsRow ? (
        <>
          <View style={sheetStyles.statsInline}>
            <View style={sheetStyles.statChip}>
              <Navigation size={10} color={FLOW_EMERALD} strokeWidth={2.2} />
              <Text style={[sheetStyles.statValue, { color: primaryTextColor }]}>
                {statLeft}
              </Text>
            </View>
            <View style={sheetStyles.statDivider} />
            <View style={sheetStyles.statChip}>
              <Clock size={10} color={FLOW_EMERALD} strokeWidth={2.2} />
              <Text style={[sheetStyles.statValue, { color: primaryTextColor }]}>
                {statRight}
              </Text>
            </View>
          </View>
          <View style={sheetStyles.tripDetailsDivider} />
        </>
      ) : null}
      <RouteInlineRow
        pickup={pickup}
        dropoff={dropoff}
        primaryTextColor={primaryTextColor}
        mutedTextColor={mutedTextColor}
      />
      {showLocationStatsRow ? (
        <>
          <View style={sheetStyles.tripDetailsDivider} />
          <View style={sheetStyles.locationStatsRow}>
            <View style={sheetStyles.locationSide}>
              <Truck size={9} color={FLOW_EMERALD} strokeWidth={2.2} />
              <Text
                style={[sheetStyles.locationText, { color: mutedTextColor }]}
                numberOfLines={1}
              >
                {trimmedLocation}
              </Text>
            </View>
            {statsEnd}
          </View>
        </>
      ) : footer ? (
        <>
          <View style={sheetStyles.tripDetailsDivider} />
          {footer}
        </>
      ) : null}
    </View>
  );
}

export const sheetStyles = StyleSheet.create({
  heroKindBadge: {
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 7,
    paddingVertical: 2,
    flexShrink: 0,
  },
  heroKindText: {
    fontSize: 7,
    fontWeight: "800",
    letterSpacing: 0.4,
  },
  heroAssignerBlock: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
    paddingLeft: 10,
    paddingRight: 0,
  },
  heroAssignerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minWidth: 0,
  },
  heroAssignerTextCol: {
    flex: 1,
    minWidth: 0,
    gap: 2,
    justifyContent: "center",
  },
  heroAssignPrimary: {
    fontSize: 11,
    fontWeight: "800",
    color: "#fff",
    lineHeight: 14,
    letterSpacing: -0.15,
  },
  heroAssignSecondary: {
    fontSize: 10,
    fontWeight: "600",
    color: FLOW_MINT,
    lineHeight: 13,
  },
  heroAvatarBorder: {
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.5)",
  },
  tripDetailsCard: {
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.border,
    backgroundColor: Theme.screenBackground,
    overflow: "hidden",
  },
  statsInline: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 32,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  statChip: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    minWidth: 0,
  },
  statValue: {
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: -0.2,
  },
  locationStatsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    minHeight: 30,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  locationSide: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    minWidth: 0,
    paddingRight: 4,
  },
  locationText: {
    flex: 1,
    minWidth: 0,
    fontSize: 9,
    fontWeight: "600",
    lineHeight: 12,
  },
  statsEndGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    flexShrink: 0,
    marginLeft: "auto",
  },
  statChipCompact: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    minWidth: 0,
  },
  statValueCompact: {
    fontSize: 9,
    fontWeight: "600",
    letterSpacing: -0.15,
    flexShrink: 1,
  },
  statSepDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: Theme.border,
    flexShrink: 0,
  },
  statDivider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: "stretch",
    backgroundColor: Theme.border,
    marginVertical: 4,
  },
  tripDetailsDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Theme.border,
    marginHorizontal: 10,
  },
  routeInlineRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    minWidth: 0,
    minHeight: 34,
    paddingVertical: 7,
    paddingHorizontal: 10,
  },
  routeSide: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minWidth: 0,
  },
  routeDotOrigin: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: Theme.textPrimaryDark,
    flexShrink: 0,
  },
  routeDotDest: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: FLOW_EMERALD,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  routeCity: {
    flexShrink: 1,
    minWidth: 0,
    fontSize: 11,
    fontWeight: "800",
    lineHeight: 14,
    letterSpacing: -0.1,
  },
  routeArrow: {
    fontSize: 11,
    fontWeight: "700",
    flexShrink: 0,
    opacity: 0.72,
    paddingHorizontal: 2,
  },
  sectionLabel: {
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
});
