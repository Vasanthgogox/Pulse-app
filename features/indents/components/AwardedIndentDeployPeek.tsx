import { memo } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChevronUp, Truck } from "lucide-react-native";
import { MotiView } from "moti";

import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { getIndentDisplayNumber } from "@/features/indents/services/indents.service";
import type { PendingAwardedDeployItem } from "@/features/indents/utils/pendingAwardedDeploy.util";
import { formatINR } from "@/lib/format";

export type AwardedIndentDeployPeekProps = {
  items: PendingAwardedDeployItem[];
  pageIndex: number;
  onExpand: () => void;
};

export const AwardedIndentDeployPeek = memo(function AwardedIndentDeployPeek({
  items,
  pageIndex,
  onExpand,
}: AwardedIndentDeployPeekProps) {
  const insets = useSafeAreaInsets();
  const item = items[pageIndex] ?? items[0];
  if (!item) return null;

  const { indent, shipperName, awardAmountInr } = item;
  const indentNo = getIndentDisplayNumber(indent);
  const origin = (indent.pickup_area || "—").split(",")[0]?.trim() || "—";
  const dest = (indent.drop_location || "—").split(",")[0]?.trim() || "—";
  const queueLabel = items.length > 1 ? `${pageIndex + 1}/${items.length}` : null;

  const webCursor =
    Platform.OS === "web" ? ({ cursor: "pointer" } as ViewStyle) : null;

  return (
    <MotiView
      from={{ opacity: 0, translateY: 48 }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ type: "timing", duration: 280 }}
      style={[
        styles.shell,
        {
          bottom:
            Math.max(insets.bottom, 8) +
            (Platform.OS === "web" ? 0 : Layout.tabBarHeight),
        },
      ]}
      pointerEvents="box-none"
    >
      <Pressable
        onPress={onExpand}
        style={({ pressed }) => [
          styles.bar,
          pressed && styles.barPressed,
          webCursor,
        ]}
        accessibilityRole="button"
        accessibilityLabel={`Trip awarded, ${shipperName}. Tap to expand and assign vehicle.`}
        accessibilityHint="Opens the full deploy card"
      >
        <View style={styles.iconTile}>
          <Truck size={18} color={Theme.textOnDark} strokeWidth={2.2} />
        </View>
        <View style={styles.textCol}>
          <View style={styles.titleRow}>
            <Text style={styles.title} numberOfLines={1}>
              Assign vehicle · {indentNo}
            </Text>
            {queueLabel ? (
              <View style={styles.queueBadge}>
                <Text style={styles.queueBadgeText}>{queueLabel}</Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.route} numberOfLines={1}>
            {origin} → {dest}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>
            {shipperName} · {formatINR(awardAmountInr)}
          </Text>
        </View>
        <View style={styles.expandCol}>
          <ChevronUp size={18} color={Theme.primary} strokeWidth={2.5} />
        </View>
      </Pressable>
    </MotiView>
  );
});

const styles = StyleSheet.create({
  shell: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    paddingHorizontal: 12,
    zIndex: 100001,
    elevation: 24,
  },
  bar: {
    width: "100%",
    maxWidth: 440,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingTop: 10,
    paddingBottom: 12,
    paddingHorizontal: 14,
    borderRadius: 18,
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    minHeight: 72,
    ...Platform.select({
      web: {
        boxShadow: "0 8px 32px rgba(15, 23, 42, 0.18)",
      },
      default: {
        shadowColor: "#0f172a",
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.14,
        shadowRadius: 20,
      },
    }),
  },
  barPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.99 }],
  },
  iconTile: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Theme.buttonMatteBlack,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    marginTop: 4,
  },
  textCol: {
    flex: 1,
    minWidth: 0,
    gap: 2,
    paddingTop: 2,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minWidth: 0,
  },
  title: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.2,
  },
  queueBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: Theme.buttonPrimary,
    flexShrink: 0,
  },
  queueBadgeText: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textOnPrimary,
  },
  route: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textMuted,
  },
  meta: {
    fontSize: 10,
    fontWeight: "500",
    color: Theme.textMuted,
  },
  expandCol: {
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    paddingLeft: 4,
  },
});
