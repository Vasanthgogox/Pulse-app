import Theme from "@/constants/Theme";
import { splitHubRouteLocationDisplay } from "@/features/trips/utils/tripLocationDisplay.util";
import {
  Platform,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

const REF = {
  ink: "#1c1c1e",
  muted: "#9aa3ad",
} as const;

const ROUTE_ARROW_TOP = 2;
const ROUTE_PIN_SIZE = 8;

export type LoadCardRouteRowProps = {
  origin: string;
  destination: string;
  /** Merged with the root row (e.g. margin overrides). */
  style?: StyleProp<ViewStyle>;
  /** Tighter type scale for hub grid / dense cards (matches trip ticket cards). */
  compact?: boolean;
};

function asRouteLabel(value: string): string {
  const t = (value || "—").trim();
  return t ? t.toUpperCase() : "—";
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
  compact,
}: {
  location: string;
  variant: "origin" | "dest";
  align: "left" | "right";
  compact?: boolean;
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
              compact && styles.legCityCompact,
              end && styles.textEnd,
            ]}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {asRouteLabel(city)}
          </Text>
          <Text
            style={[
              styles.legState,
              compact && styles.legStateCompact,
              end && styles.textEnd,
              !state && styles.legStatePlaceholder,
            ]}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {state ? asRouteLabel(state) : "\u00a0"}
          </Text>
        </View>
        {end ? <RoutePin variant={variant} /> : null}
      </View>
    </View>
  );
}

/**
 * Origin → destination row used on Load Center cards and indent detail.
 * Aligned with `TripsHubMobileTripCard` route leg typography.
 */
export function LoadCardRouteRow({
  origin,
  destination,
  style,
  compact,
}: LoadCardRouteRowProps) {
  return (
    <View style={[styles.row, compact && styles.rowCompact, style]}>
      <RouteLeg location={origin} variant="origin" align="left" compact={compact} />
      <View style={[styles.routeMid, compact && styles.routeMidCompact]}>
        <Text style={styles.routeArrow}>→</Text>
      </View>
      <RouteLeg
        location={destination}
        variant="dest"
        align="right"
        compact={compact}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 4,
    marginBottom: 8,
    width: "100%",
    maxWidth: "100%",
    overflow: "hidden",
    zIndex: 1,
  },
  rowCompact: {
    minHeight: 30,
    marginBottom: 0,
    gap: 3,
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
    backgroundColor: "#1a73e8",
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
  legCityCompact: {
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
  legStateCompact: {
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
  routeMidCompact: {
    paddingTop: ROUTE_ARROW_TOP,
  },
  routeArrow: {
    fontSize: 16,
    fontWeight: "300",
    color: REF.muted,
    lineHeight: 18,
  },
});
