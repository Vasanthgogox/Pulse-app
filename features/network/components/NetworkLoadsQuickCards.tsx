/**
 * Give / Get loads — side-by-side action cards on Network home.
 */
import Theme from "@/constants/Theme";
import { ROUTES } from "@/lib/routes";
import { useRouter } from "expo-router";
import { ArrowUpRight, Package, Search, Zap } from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";

const ACTIONS = [
  {
    id: "give",
    label: "Give loads",
    sub: "Post open freight",
    chip: "Supply",
    Icon: Package,
    accent: Theme.primary,
    cardBg: Theme.networkClientTintBg,
    chipBg: "rgba(26, 35, 126, 0.1)",
    iconBg: "rgba(26, 35, 126, 0.12)",
    wash: "rgba(26, 35, 126, 0.04)",
  },
  {
    id: "get",
    label: "Get loads",
    sub: "Bid on freight",
    chip: "Demand",
    Icon: Search,
    accent: Theme.positive,
    cardBg: Theme.networkSupplierTintBg,
    chipBg: "rgba(21, 128, 61, 0.1)",
    iconBg: "rgba(21, 128, 61, 0.12)",
    wash: "rgba(21, 128, 61, 0.04)",
  },
] as const;

export interface NetworkLoadsQuickCardsProps {
  compact?: boolean;
}

export function NetworkLoadsQuickCards({ compact = false }: NetworkLoadsQuickCardsProps) {
  const router = useRouter();

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <View style={styles.headLeft}>
          <Zap size={10} color={Theme.primary} strokeWidth={2.4} />
          <Text style={styles.kicker}>Load marketplace</Text>
        </View>
        <Text style={styles.headHint}>Tap to open Load Center</Text>
      </View>
      <View style={[styles.rail, compact && styles.railCompact]}>
        {ACTIONS.map(({ id, label, sub, chip, Icon, accent, cardBg, chipBg, iconBg, wash }) => (
          <Pressable
            key={id}
            onPress={() => router.push(ROUTES.PULSE_LOADS)}
            style={({ pressed }) => [styles.cardPress, pressed && styles.cardPressed]}
            accessibilityRole="button"
            accessibilityLabel={`${label} — open Load Center`}
          >
            <View
              style={[
                styles.card,
                compact && styles.cardCompact,
                { backgroundColor: cardBg, borderColor: Theme.borderLight },
              ]}
            >
              <View style={[styles.cardWash, { backgroundColor: wash }]} />
              <View style={[styles.cardInner, compact && styles.cardInnerCompact]}>
                <View style={styles.topRow}>
                  <View style={styles.chipRow}>
                    <View style={[styles.iconBadge, { backgroundColor: iconBg }]}>
                      <Icon size={12} color={accent} strokeWidth={2.2} />
                    </View>
                    <Text style={[styles.chip, { color: accent, backgroundColor: chipBg }]}>
                      {chip}
                    </Text>
                  </View>
                  <View style={styles.arrowBadge}>
                    <ArrowUpRight size={12} color={Theme.textSecondary} strokeWidth={2.5} />
                  </View>
                </View>
                <Text
                  style={[styles.label, compact && styles.labelCompact, { color: Theme.textPrimaryDark }]}
                  numberOfLines={2}
                >
                  {label}
                </Text>
                <Text style={[styles.sub, compact && styles.subCompact]} numberOfLines={2}>
                  {sub}
                </Text>
              </View>
            </View>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: "100%",
    gap: 6,
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
    paddingHorizontal: 2,
  },
  headLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flexShrink: 1,
    minWidth: 0,
  },
  kicker: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.primary,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  headHint: {
    fontSize: 8,
    fontWeight: "600",
    color: Theme.textMuted,
    flexShrink: 0,
  },
  rail: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 8,
    width: "100%",
  },
  railCompact: {
    gap: 6,
  },
  cardPress: {
    flex: 1,
    minWidth: 0,
  },
  card: {
    minHeight: 72,
    borderRadius: 14,
    overflow: "hidden",
    position: "relative",
    borderWidth: StyleSheet.hairlineWidth,
    backgroundColor: Theme.surface,
    shadowColor: Theme.shadow,
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  cardCompact: {
    minHeight: 66,
    borderRadius: 12,
  },
  cardWash: {
    ...StyleSheet.absoluteFillObject,
  },
  cardPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.98 }],
  },
  cardInner: {
    flex: 1,
    paddingHorizontal: 9,
    paddingVertical: 8,
    gap: 3,
    justifyContent: "center",
    minHeight: 72,
  },
  cardInnerCompact: {
    paddingHorizontal: 8,
    paddingVertical: 7,
    minHeight: 66,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
  },
  chipRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    flexShrink: 1,
    minWidth: 0,
  },
  iconBadge: {
    width: 22,
    height: 22,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  chip: {
    fontSize: 7,
    fontWeight: "800",
    letterSpacing: 0.7,
    textTransform: "uppercase",
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: "hidden",
  },
  label: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: -0.15,
    lineHeight: 15,
  },
  labelCompact: {
    fontSize: 11,
    lineHeight: 14,
  },
  sub: {
    fontSize: 9,
    fontWeight: "600",
    color: Theme.textMuted,
    letterSpacing: 0.1,
    lineHeight: 12,
  },
  subCompact: {
    fontSize: 8,
    lineHeight: 11,
  },
  arrowBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Theme.screenBackground,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
});
