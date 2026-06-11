import { CHAT_ACCENT, CHAT_ACCENT_SOFT } from "@/features/chat/chatTheme";
import Theme from "@/constants/Theme";
import type { DriverSwapPair } from "@/features/chat/utils/chatAvatar.util";
import { LinearGradient } from "expo-linear-gradient";
import { ArrowRight } from "lucide-react-native";
import { StyleSheet, View } from "react-native";
import { ChatPartyAvatar } from "../ChatPartyAvatar";

const PREV_SIZE = 26;
const NEXT_SIZE = 34;
const SHELL_W = 96;
const SHELL_H = 46;

/** Static driver swap cluster for inbox / list previews (no animation). */
export function ChatDriverSwapAvatarCompact({ swap }: { swap: DriverSwapPair }) {
  return (
    <View style={styles.outer}>
      <LinearGradient
        colors={["#FFFFFF", "#F8F9FF", "#EEF0FF"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.shell}
      >
        <LinearGradient
          colors={["rgba(91, 94, 244, 0.04)", "rgba(91, 94, 244, 0.14)", "rgba(91, 94, 244, 0.04)"]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={styles.track}
          pointerEvents="none"
        />

        <View style={styles.prevSlot}>
          <View style={[styles.avatarRing, styles.prevRing]}>
            <ChatPartyAvatar identity={swap.previous} size={PREV_SIZE} />
            <View style={styles.prevFrost} pointerEvents="none" />
          </View>
        </View>

        <View style={styles.arrowSlot}>
          <LinearGradient
            colors={[Theme.cardWhite, CHAT_ACCENT_SOFT]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.arrowPill}
          >
            <ArrowRight size={11} color={CHAT_ACCENT} strokeWidth={2.6} />
          </LinearGradient>
        </View>

        <View style={styles.nextSlot}>
          <View style={styles.nextHalo} pointerEvents="none" />
          <View style={[styles.avatarRing, styles.nextRing]}>
            <ChatPartyAvatar identity={swap.next} size={NEXT_SIZE} />
          </View>
          <View style={styles.presenceRing} pointerEvents="none" />
          <View style={styles.presenceDot} />
        </View>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    shadowColor: CHAT_ACCENT,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 2,
  },
  shell: {
    width: SHELL_W,
    height: SHELL_H,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: SHELL_H / 2,
    borderWidth: 1,
    borderColor: "rgba(91, 94, 244, 0.16)",
    overflow: "visible",
  },
  track: {
    position: "absolute",
    left: 20,
    right: 22,
    top: SHELL_H / 2 - 1,
    height: 2,
    borderRadius: 1,
  },
  prevSlot: {
    position: "absolute",
    left: 6,
    top: 9,
    zIndex: 1,
    opacity: 0.82,
  },
  arrowSlot: {
    position: "absolute",
    left: 38,
    zIndex: 3,
  },
  arrowPill: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(91, 94, 244, 0.18)",
    shadowColor: CHAT_ACCENT,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 3,
    elevation: 1,
  },
  nextSlot: {
    position: "absolute",
    right: 5,
    top: 5,
    zIndex: 2,
  },
  nextHalo: {
    position: "absolute",
    width: NEXT_SIZE + 10,
    height: NEXT_SIZE + 10,
    borderRadius: (NEXT_SIZE + 10) / 2,
    backgroundColor: "rgba(91, 94, 244, 0.08)",
    top: -5,
    left: -5,
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
    borderColor: "rgba(148, 163, 184, 0.35)",
  },
  prevFrost: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255, 255, 255, 0.48)",
    borderRadius: PREV_SIZE / 2,
  },
  nextRing: {
    width: NEXT_SIZE,
    height: NEXT_SIZE,
    borderRadius: NEXT_SIZE / 2,
    borderWidth: 2,
    borderColor: "rgba(91, 94, 244, 0.5)",
    shadowColor: CHAT_ACCENT,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 2,
  },
  presenceRing: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: 13,
    height: 13,
    borderRadius: 6.5,
    borderWidth: 1.5,
    borderColor: "rgba(91, 94, 244, 0.35)",
    backgroundColor: "rgba(255, 255, 255, 0.9)",
    zIndex: 3,
  },
  presenceDot: {
    position: "absolute",
    right: 1,
    bottom: 1,
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: CHAT_ACCENT,
    zIndex: 4,
  },
});
