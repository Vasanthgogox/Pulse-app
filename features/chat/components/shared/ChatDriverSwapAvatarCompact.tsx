import type { DriverSwapPair } from "@/features/chat/utils/chatAvatar.util";
import { LinearGradient } from "expo-linear-gradient";
import { ArrowRight } from "lucide-react-native";
import { CHAT_ACCENT } from "@/features/chat/chatTheme";
import { View } from "react-native";
import { ChatPartyAvatar } from "../ChatPartyAvatar";
import {
  DRIVER_SWAP_NEXT_SIZE,
  DRIVER_SWAP_PREV_SIZE,
  driverSwapAvatarStyles as styles,
} from "./chatDriverSwapAvatar.styles";

/** Static driver swap cluster for inbox / list previews (no animation). */
export function ChatDriverSwapAvatarCompact({ swap }: { swap: DriverSwapPair }) {
  return (
    <View style={styles.outer}>
      <View style={styles.shellClip}>
        <LinearGradient
          colors={["#FFFFFF", "#F9FAFF", "#EEF0FF"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.shellGradient}
        >
          <LinearGradient
            colors={[
              "rgba(91, 94, 244, 0.03)",
              "rgba(91, 94, 244, 0.12)",
              "rgba(91, 94, 244, 0.03)",
            ]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={styles.track}
            pointerEvents="none"
          />

          <View style={styles.prevSlot}>
            <View style={[styles.avatarRing, styles.prevRing]}>
              <ChatPartyAvatar identity={swap.previous} size={DRIVER_SWAP_PREV_SIZE} />
              <View style={styles.prevFrost} pointerEvents="none" />
            </View>
          </View>

          <View style={styles.arrowSlot}>
            <View style={styles.arrowPill}>
              <ArrowRight size={10} color={CHAT_ACCENT} strokeWidth={2.5} />
            </View>
          </View>

          <View style={styles.nextSlot}>
            <View style={styles.nextHalo} pointerEvents="none" />
            <View style={[styles.avatarRing, styles.nextRing]}>
              <ChatPartyAvatar identity={swap.next} size={DRIVER_SWAP_NEXT_SIZE} />
            </View>
            <View style={styles.presenceDot} />
          </View>
        </LinearGradient>
      </View>
    </View>
  );
}
