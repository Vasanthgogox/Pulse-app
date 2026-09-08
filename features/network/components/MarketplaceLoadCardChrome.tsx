/**
 * Shared route + spec chrome for Find Loads Discover / My Bids cards.
 * Mirrors Load Center indent cards so Marketplace surfaces match app UI.
 */
import Theme from "@/constants/Theme";
import { splitLocationParts } from "@/features/network/utils/storyDisplay";
import { ArrowRight } from "lucide-react-native";
import { Platform, ScrollView, StyleSheet, Text, View, type ViewStyle } from "react-native";

export function titleCaseWord(value: string): string {
  const t = value.trim();
  if (!t) return t;
  return t
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

export function MarketplaceRouteGrid({
  pickup,
  drop,
}: {
  pickup: string | null | undefined;
  drop: string | null | undefined;
}) {
  const originParts = splitLocationParts(pickup);
  const destParts = splitLocationParts(drop);

  return (
    <View style={styles.routeGrid}>
      <View style={styles.routeCol}>
        <Text style={styles.routeLabel}>Pickup</Text>
        <Text style={styles.routeCity} numberOfLines={1}>
          {titleCaseWord(originParts.city)}
        </Text>
        {originParts.state ? (
          <Text style={styles.routeState} numberOfLines={1}>
            {titleCaseWord(originParts.state)}
          </Text>
        ) : (
          <Text style={styles.routeStateSpacer}>{"\u00a0"}</Text>
        )}
      </View>
      <View style={styles.routeSep} pointerEvents="none" accessibilityElementsHidden>
        <View style={styles.routeSepLine} />
        <ArrowRight size={14} color={Theme.textMuted} strokeWidth={2.2} />
        <View style={styles.routeSepLine} />
      </View>
      <View style={[styles.routeCol, styles.routeColEnd]}>
        <Text style={[styles.routeLabel, styles.routeLabelEnd]}>Drop</Text>
        <Text style={[styles.routeCity, styles.routeCityEnd]} numberOfLines={1}>
          {titleCaseWord(destParts.city)}
        </Text>
        {destParts.state ? (
          <Text style={[styles.routeState, styles.routeStateEnd]} numberOfLines={1}>
            {titleCaseWord(destParts.state)}
          </Text>
        ) : (
          <Text style={[styles.routeStateSpacer, styles.routeStateEnd]}>{"\u00a0"}</Text>
        )}
      </View>
    </View>
  );
}

export function MarketplaceSpecChips({
  chips,
  dateLabel,
}: {
  chips: string[];
  dateLabel?: string | null;
}) {
  if (chips.length === 0 && !dateLabel) return null;

  return (
    <ScrollView
      horizontal
      nestedScrollEnabled
      showsHorizontalScrollIndicator={false}
      showsVerticalScrollIndicator={false}
      bounces={false}
      style={styles.specScroll}
      contentContainerStyle={styles.specRow}
    >
      {chips.map((chip) => (
        <View key={chip} style={styles.specChip}>
          <Text style={styles.specChipText} numberOfLines={1}>
            {chip}
          </Text>
        </View>
      ))}
      {dateLabel ? (
        <View style={[styles.specChip, styles.specChipDate]}>
          <Text style={styles.specChipDateText} numberOfLines={1}>
            {dateLabel}
          </Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  routeGrid: Platform.select({
    web: {
      display: "grid",
      gridTemplateColumns: "minmax(0, 1fr) 44px minmax(0, 1fr)",
      columnGap: 10,
      alignItems: "center",
      width: "100%",
      maxWidth: "100%",
      paddingVertical: 2,
    } as ViewStyle,
    default: {
      flexDirection: "row",
      alignItems: "center",
      alignSelf: "stretch",
      width: "100%",
      gap: 10,
      paddingVertical: 2,
    },
  }),
  routeCol: Platform.select({
    web: {
      minWidth: 0,
      maxWidth: "100%",
      overflow: "hidden",
    } as ViewStyle,
    default: {
      flex: 1,
      flexGrow: 1,
      flexShrink: 1,
      flexBasis: 0,
      minWidth: 0,
    },
  }),
  routeColEnd: {
    alignItems: "flex-end",
  },
  routeSep: {
    paddingTop: 4,
    width: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    flexShrink: 0,
    flexGrow: 0,
    alignSelf: "center",
  },
  routeSepLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: Theme.border,
  },
  routeLabel: {
    fontSize: 9,
    fontWeight: "600",
    color: Theme.textMuted,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginBottom: 3,
    lineHeight: 11,
  },
  routeLabelEnd: {
    textAlign: "right",
    width: "100%",
  },
  routeCity: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    lineHeight: 15,
    letterSpacing: -0.2,
  },
  routeCityEnd: {
    textAlign: "right",
    width: "100%",
  },
  routeState: {
    marginTop: 1,
    fontSize: 10,
    fontWeight: "400",
    color: Theme.textMuted,
    lineHeight: 12,
  },
  routeStateEnd: {
    textAlign: "right",
    width: "100%",
  },
  routeStateSpacer: {
    marginTop: 1,
    fontSize: 10,
    lineHeight: 12,
    color: "transparent",
  },
  specScroll: {
    width: "100%",
    maxWidth: "100%",
    flexGrow: 0,
    flexShrink: 0,
    alignSelf: "stretch",
    marginTop: 1,
  },
  specRow: {
    flexDirection: "row",
    flexWrap: "nowrap",
    alignItems: "center",
    gap: 5,
    paddingVertical: 1,
    paddingRight: 8,
  },
  specChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: Theme.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.surfaceBorder,
    flexGrow: 0,
    flexShrink: 0,
  },
  specChipDate: {
    backgroundColor: Theme.brandBlueSoft,
    borderColor: Theme.brandBlue,
  },
  specChipText: {
    fontSize: 10,
    fontWeight: "500",
    color: Theme.textSecondary,
    lineHeight: 13,
  },
  specChipDateText: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.primary,
    lineHeight: 13,
  },
});
