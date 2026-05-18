/**
 * Muted metric tiles for network hub list rows — flat surfaces for crisp corners.
 */
import Theme from "@/constants/Theme";
import { NETWORK_HUB_RADIUS } from "@/features/network/components/networkHubListCardChrome";
import { useId } from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Defs, LinearGradient as SvgGradient, Path, Stop } from "react-native-svg";

const METRIC_BOX_DEFAULT = 40;
const METRIC_BOX_COMPACT = 36;

export function TransitNodeMetric({
  count,
  compact,
}: {
  count: string;
  compact?: boolean;
}) {
  const box = compact ? METRIC_BOX_COMPACT : METRIC_BOX_DEFAULT;
  const icon = compact ? 16 : 18;
  const gradId = `transitLineGrad-${useId().replace(/:/g, "")}`;
  return (
    <View style={styles.metricCol} accessibilityLabel={`${count} trips`}>
      <View style={[styles.metricTile, { width: box, height: box }]}>
        <Svg width={icon} height={icon} viewBox="0 0 24 24">
          <Defs>
            <SvgGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="0%">
              <Stop offset="0%" stopColor="#6366F1" />
              <Stop offset="100%" stopColor="#A855F7" />
            </SvgGradient>
          </Defs>
          <Path
            d="M4 18C8 8 16 8 20 18"
            stroke={`url(#${gradId})`}
            strokeWidth={2}
            strokeLinecap="round"
            fill="none"
          />
          <Circle cx={4} cy={18} r={2.5} fill="#6366F1" stroke="#fff" strokeWidth={1.2} />
          <Circle cx={20} cy={18} r={2.5} fill="#A855F7" stroke="#fff" strokeWidth={1.2} />
        </Svg>
        <View style={styles.metricBadgeDark}>
          <Text style={styles.metricBadgeDarkText}>{count}</Text>
        </View>
      </View>
    </View>
  );
}

export function MutedStarMetric({
  rating,
  compact,
}: {
  rating: string;
  compact?: boolean;
}) {
  const box = compact ? METRIC_BOX_COMPACT : METRIC_BOX_DEFAULT;
  const icon = compact ? 14 : 16;
  return (
    <View style={styles.metricCol} accessibilityLabel={`${rating} rating`}>
      <View style={[styles.metricTile, { width: box, height: box }]}>
        <Svg width={icon} height={icon} viewBox="0 0 24 24">
          <Path
            d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"
            fill={Theme.networkHubListCardRatingStar}
          />
        </Svg>
        <View style={styles.metricBadgeRating}>
          <Text style={styles.metricBadgeRatingText}>{rating}</Text>
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
    borderWidth: 1,
    borderColor: Theme.networkHubListCardMetricsBorder,
    backgroundColor: Theme.networkHubListCardBackground,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
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
});
