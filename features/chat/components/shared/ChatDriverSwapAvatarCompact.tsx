import { CHAT_ACCENT, CHAT_ACCENT_SOFT } from "@/features/chat/chatTheme";
import Theme from "@/constants/Theme";
import type { DriverSwapPair } from "@/features/chat/utils/chatAvatar.util";
import { LinearGradient } from "expo-linear-gradient";
import { ArrowRight, Truck } from "lucide-react-native";
import { StyleSheet, View } from "react-native";
import { ChatPartyAvatar } from "../ChatPartyAvatar";

const PREV_SIZE = 28;
const NEXT_SIZE = 36;
const SHELL_W = 102;
const SHELL_H = 48;

/** Static driver swap cluster for inbox / list previews (no animation). */
export function ChatDriverSwapAvatarCompact({ swap }: { swap: DriverSwapPair }) {
  return (
    <View style={styles.outer}>
      <LinearGradient
        colors={["#FFFFFF", "#F4F5FF", "#EEF0FF"]}
        start={{ x: 0, y: 0.2 }}
        end={{ x: 1, y: 1 }}
        style={styles.shell}
      >
        <View style={styles.track} pointerEvents="none" />

        <View style={styles.prevSlot}>
          <View style={[styles.avatarRing, styles.prevRing]}>
            <ChatPartyAvatar identity={swap.previous} size={PREV_SIZE} />
            <View style={styles.prevFrost} pointerEvents="none" />
          </View>
        </View>

        <View style={styles.arrowSlot}>
          <View style={styles.arrowPill}>
            <ArrowRight size={11} color={CHAT_ACCENT} strokeWidth={2.8} />
          </View>
        </View>

        <View style={styles.nextSlot}>
          <View style={styles.nextGlow} pointerEvents="none" />
          <View style={[styles.avatarRing, styles.nextRing]}>
            <ChatPartyAvatar identity={swap.next} size={NEXT_SIZE} />
          </View>
          <View style={styles.truckBadge}>
            <Truck size={10} color={CHAT_ACCENT} strokeWidth={2.5} />
          </View>
          <View style={styles.presenceDot} />
        </View>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    shadowColor: "#5b5ef4",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 2,
  },
  shell: {
    width: SHELL_W,
    height: SHELL_H,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: SHELL_H / 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(91, 94, 244, 0.22)",
    overflow: "visible",
  },
  track: {
    position: "absolute",
    left: 18,
    right: 18,
    top: SHELL_H / 2 - 1,
    height: 2,
    borderRadius: 1,
    backgroundColor: "rgba(91, 94, 244, 0.08)",
  },
  prevSlot: {
    position: "absolute",
    left: 5,
    top: 8,
    zIndex: 1,
    opacity: 0.88,
  },
  arrowSlot: {
    position: "absolute",
    left: 40,
    zIndex: 3,
  },
  arrowPill: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.cardWhite,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(91, 94, 244, 0.2)",
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 1,
  },
  nextSlot: {
    position: "absolute",
    right: 4,
    top: 5,
    zIndex: 2,
  },
  nextGlow: {
    position: "absolute",
    width: NEXT_SIZE + 8,
    height: NEXT_SIZE + 8,
    borderRadius: (NEXT_SIZE + 8) / 2,
    backgroundColor: "rgba(91, 94, 244, 0.1)",
    top: -4,
    left: -4,
  },
  avatarRing: {
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: CHAT_ACCENT_SOFT,
  },
  prevRing: {
    width: PREV_SIZE,
    height: PREV_SIZE,
    borderRadius: PREV_SIZE / 2,
    borderWidth: 1.5,
    borderColor: "rgba(148, 163, 184, 0.45)",
  },
  prevFrost: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255, 255, 255, 0.42)",
    borderRadius: PREV_SIZE / 2,
  },
  nextRing: {
    width: NEXT_SIZE,
    height: NEXT_SIZE,
    borderRadius: NEXT_SIZE / 2,
    borderWidth: 2,
    borderColor: "rgba(91, 94, 244, 0.55)",
    shadowColor: CHAT_ACCENT,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.18,
    shadowRadius: 5,
    elevation: 2,
  },
  truckBadge: {
    position: "absolute",
    left: -5,
    bottom: -3,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.cardWhite,
    borderWidth: 1.5,
    borderColor: "rgba(91, 94, 244, 0.3)",
    zIndex: 4,
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  presenceDot: {
    position: "absolute",
    right: -1,
    bottom: -1,
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: CHAT_ACCENT,
    borderWidth: 2,
    borderColor: Theme.cardWhite,
    zIndex: 4,
  },
});
