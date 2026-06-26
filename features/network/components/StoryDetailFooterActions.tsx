/**
 * Story viewer footer — refined Load Center action buttons.
 */
import Theme from "@/constants/Theme";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { ArrowUpRight, Eye } from "lucide-react-native";
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
  hint: string;
  primaryLabel: string;
  onViewersPress: () => void;
  onPrimaryPress: () => void;
  onShareWhatsApp: () => void;
};

export function StoryOwnerFooterActions({
  viewsLabel,
  hint,
  primaryLabel,
  onViewersPress,
  onPrimaryPress,
  onShareWhatsApp,
}: StoryOwnerActionsProps) {
  const { width } = useWindowDimensions();
  const sideBySide = width >= 380;

  return (
    <View style={styles.wrap}>
      <Pressable
        style={({ pressed }) => [styles.viewersPill, pressed && styles.pressedSoft]}
        onPress={onViewersPress}
        hitSlop={6}
      >
        <View style={styles.viewersIconWrap}>
          <Eye size={12} color={INK} strokeWidth={2.25} />
        </View>
        <Text style={styles.viewersPillText}>{viewsLabel}</Text>
      </Pressable>

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
