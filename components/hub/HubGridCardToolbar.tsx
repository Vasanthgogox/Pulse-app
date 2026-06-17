/**
 * Shared single-row toolbar for 4-column hub grid cards (trips, indents).
 */
import {
  HUB_GRID_TOOLBAR_AWARDED_SLOT_W,
  HUB_GRID_TOOLBAR_ROW_HEIGHT,
  HUB_GRID_TOOLBAR_STATUS_SLOT_W,
} from "@/components/hub/hubGridCardLayout";
import Theme from "@/constants/Theme";
import { Children, type ReactNode } from "react";
import {
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

const TESLA_BLACK = "#1A1A1A";
const FOOTER_BORDER = "#e8ecf0";

export function HubGridCardFooter({
  dense,
  style,
  children,
}: {
  dense?: boolean;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  return (
    <View style={[styles.footer, dense && styles.footerDense, style]}>
      {children}
    </View>
  );
}

export function HubGridToolbarRow({
  status,
  share,
  primary,
  trailing,
  statusSlot = "default",
}: {
  status: ReactNode;
  share?: ReactNode | null;
  primary: ReactNode;
  trailing?: ReactNode | null;
  /** Widen the left status column for amount / awarded chips. */
  statusSlot?: "default" | "wide" | "amount";
}) {
  return (
    <View style={styles.denseRow}>
      <View
        style={[
          styles.toolbarStatusSlot,
          statusSlot === "wide" && styles.toolbarStatusSlotWide,
          statusSlot === "amount" && styles.toolbarStatusSlotAmount,
        ]}
      >
        {status}
      </View>
      {share ?? <View style={styles.sharePlaceholder} />}
      <View style={styles.ctaGroup}>
        <View style={styles.primarySlot}>{primary}</View>
        {trailing ? <View style={styles.trailingSlot}>{trailing}</View> : null}
      </View>
    </View>
  );
}

export function HubGridShareButton({
  onPress,
  label,
  icon,
}: {
  onPress: () => void;
  label: string;
  icon: ReactNode;
}) {
  return (
    <TouchableOpacity
      style={styles.shareBtn}
      onPress={onPress}
      activeOpacity={0.88}
      accessibilityLabel={label}
    >
      {icon}
    </TouchableOpacity>
  );
}

export function HubGridPrimaryButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <TouchableOpacity
      style={styles.primaryBtn}
      onPress={onPress}
      activeOpacity={0.9}
      disabled={disabled}
    >
      <Text
        style={styles.primaryBtnText}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.75}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

/** Equal-width metric chips (no primary CTA) — e.g. sales / receivable / payable. */
export function HubGridMetricsPair({
  left,
  right,
}: {
  left: ReactNode;
  right: ReactNode;
}) {
  return (
    <HubGridMetricsRow>
      {left}
      {right}
    </HubGridMetricsRow>
  );
}

export function HubGridMetricsRow({ children }: { children: ReactNode }) {
  return (
    <View style={styles.metricsRow}>
      {Children.toArray(children).map((child, i) => (
        <View key={i} style={styles.metricCell}>
          {child}
        </View>
      ))}
    </View>
  );
}

export function HubGridStatusChip({
  icon,
  line1,
  line2,
  amountLine,
  accessibilityLabel,
  wide,
  amount,
  fill,
  compact,
}: {
  icon: ReactNode;
  line1: string;
  line2?: string;
  amountLine?: boolean;
  accessibilityLabel?: string;
  wide?: boolean;
  /** Full-width amount chip (awarded rate in load grid footer). */
  amount?: boolean;
  /** Grow to fill parent (metrics row cells). */
  fill?: boolean;
  /** Trip finance footer — smaller amount + label type. */
  compact?: boolean;
}) {
  return (
    <View
      style={[
        styles.statusChip,
        wide && styles.statusChipWide,
        amount && styles.statusChipAmountSlot,
        fill && styles.statusChipFill,
      ]}
      accessibilityLabel={accessibilityLabel}
    >
      <View style={styles.statusChipIcon}>{icon}</View>
      <View style={styles.statusChipTextWrap}>
        <Text
          style={[
            styles.statusChipLine1,
            amountLine && styles.statusChipAmount,
            compact && !amountLine && styles.statusChipLine1Compact,
            compact && amountLine && styles.statusChipAmountCompact,
          ]}
          numberOfLines={1}
          ellipsizeMode="tail"
          adjustsFontSizeToFit={amountLine || amount}
          minimumFontScale={0.72}
        >
          {line1}
        </Text>
        {line2 ? (
          <Text
            style={[
              styles.statusChipLine2,
              compact && styles.statusChipLine2Compact,
            ]}
            numberOfLines={1}
          >
            {line2}
          </Text>
        ) : compact ? null : (
          <Text style={styles.statusChipLine2Placeholder}>{ "\u00a0" }</Text>
        )}
      </View>
    </View>
  );
}

export function HubGridToolbarPlaceholder() {
  return <View style={styles.primaryToolbarPlaceholder} />;
}

const styles = StyleSheet.create({
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: FOOTER_BORDER,
    paddingTop: 8,
    paddingBottom: 10,
    paddingHorizontal: 10,
    width: "100%",
    minWidth: 0,
  },
  footerDense: {
    paddingTop: 7,
    paddingBottom: 8,
    paddingHorizontal: 8,
    minHeight: HUB_GRID_TOOLBAR_ROW_HEIGHT + 16,
    justifyContent: "center",
    backgroundColor: Theme.surface,
    borderTopColor: "rgba(15, 23, 42, 0.06)",
  },
  denseRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    width: "100%",
    minWidth: 0,
    height: HUB_GRID_TOOLBAR_ROW_HEIGHT,
    ...Platform.select({
      web: { columnGap: 6 } as ViewStyle,
      default: {},
    }),
  },
  toolbarStatusSlot: {
    width: HUB_GRID_TOOLBAR_STATUS_SLOT_W,
    flexShrink: 0,
    alignItems: "flex-start",
  },
  toolbarStatusSlotWide: {
    width: 64,
  },
  toolbarStatusSlotAmount: {
    width: HUB_GRID_TOOLBAR_AWARDED_SLOT_W,
  },
  ctaGroup: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    minWidth: 0,
    overflow: "hidden",
    gap: 6,
    ...Platform.select({
      web: { columnGap: 6 } as ViewStyle,
      default: {},
    }),
  },
  primarySlot: {
    flex: 1,
    minWidth: 0,
    overflow: "hidden",
  },
  trailingSlot: {
    flexShrink: 0,
    marginLeft: 2,
  },
  sharePlaceholder: {
    width: HUB_GRID_TOOLBAR_ROW_HEIGHT,
    height: HUB_GRID_TOOLBAR_ROW_HEIGHT,
    flexShrink: 0,
  },
  primaryGrow: {
    flex: 1,
    minWidth: 0,
  },
  primaryToolbarPlaceholder: {
    width: "100%",
    minHeight: HUB_GRID_TOOLBAR_ROW_HEIGHT,
    borderRadius: 8,
  },
  shareBtn: {
    width: HUB_GRID_TOOLBAR_ROW_HEIGHT,
    height: HUB_GRID_TOOLBAR_ROW_HEIGHT,
    borderRadius: 8,
    backgroundColor: Theme.surfaceGray,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  primaryBtn: {
    backgroundColor: TESLA_BLACK,
    flex: 1,
    minWidth: 0,
    maxWidth: "100%",
    minHeight: HUB_GRID_TOOLBAR_ROW_HEIGHT,
    height: HUB_GRID_TOOLBAR_ROW_HEIGHT,
    paddingHorizontal: 8,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
    alignSelf: "stretch",
  },
  primaryBtnText: {
    fontSize: 8,
    fontWeight: "800",
    color: Theme.textOnPrimary,
    textTransform: "uppercase",
    letterSpacing: 0.2,
  },
  statusChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    flexShrink: 0,
    width: "100%",
    maxWidth: HUB_GRID_TOOLBAR_STATUS_SLOT_W,
    minWidth: 44,
    height: HUB_GRID_TOOLBAR_ROW_HEIGHT,
    paddingHorizontal: 3,
    borderRadius: 8,
    backgroundColor: Theme.cardWhite,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
  },
  statusChipWide: {
    maxWidth: 64,
    minWidth: 48,
  },
  statusChipAmountSlot: {
    maxWidth: HUB_GRID_TOOLBAR_AWARDED_SLOT_W,
    minWidth: HUB_GRID_TOOLBAR_AWARDED_SLOT_W - 4,
    width: "100%",
    paddingHorizontal: 4,
  },
  statusChipFill: {
    flex: 1,
    width: "100%",
    maxWidth: "100%",
    minWidth: 0,
  },
  metricsRow: {
    flexDirection: "row",
    alignItems: "stretch",
    width: "100%",
    minWidth: 0,
    gap: 6,
    ...Platform.select({
      web: { columnGap: 6 } as ViewStyle,
      default: {},
    }),
  },
  metricCell: {
    flex: 1,
    minWidth: 0,
  },
  statusChipIcon: {
    width: 16,
    height: 16,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  statusChipTextWrap: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
  },
  statusChipLine1: {
    fontSize: 8,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    letterSpacing: 0,
    lineHeight: 10,
  },
  statusChipAmount: {
    textTransform: "none",
    letterSpacing: 0,
    fontVariant: ["tabular-nums"],
  },
  statusChipLine1Compact: {
    fontSize: 7,
    lineHeight: 9,
    letterSpacing: 0,
  },
  statusChipAmountCompact: {
    fontSize: 9,
    lineHeight: 11,
    fontWeight: "600",
  },
  statusChipLine2: {
    fontSize: 7,
    fontWeight: "600",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.2,
    lineHeight: 8,
  },
  statusChipLine2Compact: {
    fontSize: 6,
    lineHeight: 7,
    letterSpacing: 0.15,
    fontWeight: "500",
  },
  statusChipLine2Placeholder: {
    fontSize: 7,
    lineHeight: 8,
    opacity: 0,
  },
});
