/**
 * Muted metric tiles for network hub list rows — flat surfaces for crisp corners.
 * Uses lucide icons (not react-native-svg) for Expo Go / New Architecture compatibility.
 */
import Theme from "@/constants/Theme";
import { NETWORK_HUB_RADIUS } from "@/features/network/components/networkHubListCardChrome";
import { Route, Star } from "lucide-react-native";
import { StyleSheet, Text, View } from "react-native";

const METRIC_BOX_DEFAULT = 40;
const METRIC_BOX_COMPACT = 36;
const METRIC_BOX_MOBILE = 30;

/** Full-width native list footer — readable trips + rating (no tiny bordered tiles). */
export function NetworkHubMetricsInlineRow({
  trips,
  rating,
}: {
  trips: string;
  rating: string;
}) {
  return (
    <View style={styles.inlineRow} accessibilityLabel={`${trips} trips, ${rating} rating`}>
      <View style={styles.inlineItem}>
        <View style={[styles.inlineIconWrap, styles.inlineIconWrapTrips]}>
          <Route size={12} color="#6366F1" strokeWidth={2} />
        </View>
        <Text style={styles.inlineValue} numberOfLines={1}>
          {trips}
        </Text>
      </View>
      <Text style={styles.inlineDotSep} accessibilityElementsHidden importantForAccessibility="no">
        ·
      </Text>
      <View style={styles.inlineItem}>
        <View style={[styles.inlineIconWrap, styles.inlineIconWrapRating]}>
          <Star
            size={11}
            color={Theme.networkHubListCardRatingStar}
            fill={Theme.networkHubListCardRatingStar}
            strokeWidth={2}
          />
        </View>
        <Text style={styles.inlineValue} numberOfLines={1}>
          {rating}
        </Text>
      </View>
    </View>
  );
}

export function TransitNodeMetric({
  count,
  compact,
  mobile,
}: {
  count: string;
  compact?: boolean;
  mobile?: boolean;
}) {
  const box = mobile ? METRIC_BOX_MOBILE : compact ? METRIC_BOX_COMPACT : METRIC_BOX_DEFAULT;
  const icon = mobile ? 14 : compact ? 16 : 18;
  return (
    <View style={styles.metricCol} accessibilityLabel={`${count} trips`}>
      <View style={[styles.metricTile, { width: box, height: box }]}>
        <Route size={icon} color="#6366F1" strokeWidth={2.2} />
        <View style={[styles.metricBadgeDark, mobile && styles.metricBadgeMobile]}>
          <Text style={[styles.metricBadgeDarkText, mobile && styles.metricBadgeTextMobile]}>
            {count}
          </Text>
        </View>
      </View>
    </View>
  );
}

export function MutedStarMetric({
  rating,
  compact,
  mobile,
}: {
  rating: string;
  compact?: boolean;
  mobile?: boolean;
}) {
  const box = mobile ? METRIC_BOX_MOBILE : compact ? METRIC_BOX_COMPACT : METRIC_BOX_DEFAULT;
  const icon = mobile ? 12 : compact ? 14 : 16;
  return (
    <View style={styles.metricCol} accessibilityLabel={`${rating} rating`}>
      <View style={[styles.metricTile, { width: box, height: box }]}>
        <Star
          size={icon}
          color={Theme.networkHubListCardRatingStar}
          fill={Theme.networkHubListCardRatingStar}
          strokeWidth={2}
        />
        <View style={[styles.metricBadgeRating, mobile && styles.metricBadgeMobile]}>
          <Text style={[styles.metricBadgeRatingText, mobile && styles.metricBadgeTextMobile]}>
            {rating}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  metricCol: {
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
  },
  metricTile: {
    borderRadius: NETWORK_HUB_RADIUS.metric,
    backgroundColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
    overflow: "visible",
    paddingBottom: 10,
  },
  metricBadgeDark: {
    position: "absolute",
    bottom: 3,
    left: 4,
    right: 4,
    alignItems: "center",
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: NETWORK_HUB_RADIUS.badge,
    backgroundColor: Theme.textPrimaryDark,
    overflow: "hidden",
    minWidth: 20,
  },
  metricBadgeDarkText: {
    fontSize: 8,
    fontWeight: "800",
    color: Theme.textOnPrimary,
    letterSpacing: 0.3,
    textTransform: "uppercase",
    textAlign: "center",
  },
  metricBadgeRating: {
    position: "absolute",
    bottom: 3,
    left: 4,
    right: 4,
    alignItems: "center",
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: NETWORK_HUB_RADIUS.badge,
    backgroundColor: Theme.networkHubListCardRatingBg,
    borderWidth: 1,
    borderColor: Theme.networkHubListCardRatingBorder,
    overflow: "hidden",
    minWidth: 20,
  },
  metricBadgeRatingText: {
    fontSize: 8,
    fontWeight: "700",
    color: Theme.networkHubListCardRatingText,
    letterSpacing: 0.1,
    textAlign: "center",
  },
  metricBadgeMobile: {
    bottom: 2,
    left: 3,
    right: 3,
    paddingVertical: 1,
    minWidth: 16,
  },
  metricBadgeTextMobile: {
    fontSize: 7,
    letterSpacing: 0.2,
  },
  inlineRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 0,
    minHeight: 28,
  },
  inlineItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 0,
  },
  inlineIconWrap: {
    width: 24,
    height: 24,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  inlineIconWrapTrips: {
    backgroundColor: "rgba(99, 102, 241, 0.12)",
  },
  inlineIconWrapRating: {
    backgroundColor: Theme.networkHubListCardRatingBg,
  },
  inlineValue: {
    fontSize: 11,
    fontWeight: "500",
    color: Theme.textPrimaryDark,
    letterSpacing: 0,
    lineHeight: 14,
    minWidth: 16,
    fontVariant: ["tabular-nums"],
  },
  inlineDotSep: {
    fontSize: 10,
    fontWeight: "400",
    color: Theme.textMuted,
    lineHeight: 14,
    paddingHorizontal: 2,
    flexShrink: 0,
  },
});
