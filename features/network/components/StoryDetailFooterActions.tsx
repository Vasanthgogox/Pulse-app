/**
 * Story viewer footer — refined Load Center action buttons.
 */
import Theme from "@/constants/Theme";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import Feather from "@expo/vector-icons/Feather";
import { ArrowUpRight, Eye, Rocket } from "lucide-react-native";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";

const INK = Theme.loadAddButtonText;
const MUTED = Theme.loadStatusTabTextMuted;
const WA_GREEN = "#25D366";

type StoryOwnerActionsProps = {
  viewsLabel: string;
  bidsLabel?: string;
  hint: string;
  primaryLabel: string;
  onViewersPress: () => void;
  onBidsPress?: () => void;
  onPrimaryPress: () => void;
  onShareWhatsApp: () => void;
  /** Reach boost — omitted entirely for non-LOAD stories. */
  boostLabel?: string;
  onBoostPress?: () => void;
};

export function StoryOwnerFooterActions({
  viewsLabel,
  bidsLabel,
  hint,
  primaryLabel,
  onViewersPress,
  onBidsPress,
  onPrimaryPress,
  onShareWhatsApp,
  boostLabel,
  onBoostPress,
}: StoryOwnerActionsProps) {
  const { width } = useWindowDimensions();
  const sideBySide = width >= 380;
  const showBids = Boolean(onBidsPress && bidsLabel);
  const showBoost = Boolean(onBoostPress && boostLabel);

  return (
    <View style={styles.wrap}>
      <View style={[styles.metricsRow, (showBids || showBoost) && styles.metricsRowSplit]}>
        <Pressable
          style={({ pressed }) => [
            styles.metricPill,
            (showBids || showBoost) && styles.metricPillSplit,
            pressed && styles.pressedSoft,
          ]}
          onPress={onViewersPress}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel="View story viewers"
        >
          <View style={styles.viewersIconWrap}>
            <Eye size={12} color={INK} strokeWidth={2.25} />
          </View>
          <Text style={styles.viewersPillText}>{viewsLabel}</Text>
        </Pressable>

        {showBids ? (
          <Pressable
            style={({ pressed }) => [
              styles.metricPill,
              styles.metricPillSplit,
              styles.bidsPill,
              pressed && styles.pressedSoft,
            ]}
            onPress={onBidsPress}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel="View bids"
          >
            <View style={[styles.viewersIconWrap, styles.bidsIconWrap]}>
              <Feather name="inbox" size={12} color={INK} />
            </View>
            <Text style={styles.viewersPillText}>{bidsLabel}</Text>
          </Pressable>
        ) : null}

        {showBoost ? (
          <Pressable
            style={({ pressed }) => [
              styles.metricPill,
              styles.metricPillSplit,
              styles.boostPill,
              pressed && styles.pressedSoft,
            ]}
            onPress={onBoostPress}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel="Boost this load"
          >
            <View style={[styles.viewersIconWrap, styles.boostIconWrap]}>
              <Rocket size={12} color={INK} strokeWidth={2.25} />
            </View>
            <Text style={styles.viewersPillText}>{boostLabel}</Text>
          </Pressable>
        ) : null}
      </View>

      <Text style={styles.hint}>{hint}</Text>

      <View style={[styles.actionRow, sideBySide && styles.actionRowInline]}>
        <Pressable
          style={({ pressed }) => [
            styles.primaryBtn,
            sideBySide && styles.actionFlex,
            pressed && styles.primaryBtnPressed,
          ]}
          onPress={onPrimaryPress}
          accessibilityRole="button"
        >
          <Text style={styles.primaryBtnText} numberOfLines={1}>
            {primaryLabel}
          </Text>
          <View style={styles.primaryBtnIcon}>
            <ArrowUpRight size={14} color={INK} strokeWidth={2.5} />
          </View>
        </Pressable>

        <Pressable
          style={({ pressed }) => [
            styles.shareBtn,
            sideBySide && styles.actionFlex,
            pressed && styles.shareBtnPressed,
          ]}
          onPress={onShareWhatsApp}
          accessibilityRole="button"
          accessibilityLabel="Share story bidding link on WhatsApp"
        >
          <View style={styles.shareIconBadge}>
            <FontAwesome name="whatsapp" size={15} color={Theme.textOnPrimary} />
          </View>
          <Text style={styles.shareBtnText} numberOfLines={1}>
            Share on WhatsApp
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const btnShadow = Platform.select({
  web: { boxShadow: "0 2px 10px rgba(77, 54, 54, 0.08)" } as object,
  ios: {
    shadowColor: "#4D3636",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  android: { elevation: 2 },
  default: {},
});

const styles = StyleSheet.create({
  wrap: {
    width: "100%",
    gap: 10,
  },
  metricsRow: {
    width: "100%",
    alignItems: "center",
  },
  metricsRowSplit: {
    flexDirection: "row",
    gap: 8,
  },
  metricPill: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: Theme.loadStatusTabTrayBg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.loadStatusTabBorderSoft,
  },
  metricPillSplit: {
    flex: 1,
    minWidth: 0,
  },
  bidsPill: {
    backgroundColor: Theme.loadAddButtonBg,
    borderColor: Theme.loadStatusTabBorderSoft,
  },
  viewersPill: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    gap: 6,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: Theme.loadStatusTabTrayBg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.loadStatusTabBorderSoft,
  },
  viewersIconWrap: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Theme.loadAddButtonBg,
    alignItems: "center",
    justifyContent: "center",
  },
  bidsIconWrap: {
    backgroundColor: "rgba(255,255,255,0.92)",
  },
  boostPill: {
    backgroundColor: Theme.accentGoldMuted,
    borderColor: Theme.accentGoldBorder,
  },
  boostIconWrap: {
    backgroundColor: "rgba(255,255,255,0.92)",
  },
  viewersPillText: {
    fontSize: 11,
    fontWeight: "700",
    color: MUTED,
    letterSpacing: 0.1,
  },
  hint: {
    fontSize: 11,
    color: MUTED,
    fontWeight: "600",
    textAlign: "center",
    lineHeight: 16,
    paddingHorizontal: 12,
  },
  actionRow: {
    width: "100%",
    gap: 10,
  },
  actionRowInline: {
    flexDirection: "row",
    alignItems: "stretch",
  },
  actionFlex: {
    flex: 1,
    minWidth: 0,
  },
  primaryBtn: {
    minHeight: 50,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Theme.loadAddButtonBg,
    borderWidth: Theme.buttonPrimaryBorderWidth,
    borderColor: Theme.buttonPrimaryBorder,
    ...btnShadow,
  },
  primaryBtnPressed: {
    backgroundColor: Theme.loadAddButtonBgPressed,
    transform: [{ scale: 0.985 }],
  },
  primaryBtnText: {
    flexShrink: 1,
    fontSize: 13,
    fontWeight: "800",
    color: INK,
    letterSpacing: -0.15,
  },
  primaryBtnIcon: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: Theme.accentGoldMuted,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.accentGoldBorder,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  shareBtn: {
    minHeight: 50,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: Theme.cardWhite,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.loadStatusTabTrayBorder,
    ...btnShadow,
  },
  shareBtnPressed: {
    backgroundColor: Theme.loadStatusTabTrayBg,
    transform: [{ scale: 0.985 }],
  },
  shareBtnText: {
    flexShrink: 1,
    fontSize: 13,
    fontWeight: "800",
    color: INK,
    letterSpacing: -0.15,
  },
  shareIconBadge: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: WA_GREEN,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  pressedSoft: {
    opacity: 0.88,
  },
});
