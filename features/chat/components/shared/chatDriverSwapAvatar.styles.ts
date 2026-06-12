import { CHAT_ACCENT, CHAT_ACCENT_SOFT } from "@/features/chat/chatTheme";
import Theme from "@/constants/Theme";
import { Platform, StyleSheet } from "react-native";

export const DRIVER_SWAP_PREV_SIZE = 26;
export const DRIVER_SWAP_NEXT_SIZE = 32;
export const DRIVER_SWAP_SHELL_W = 94;
export const DRIVER_SWAP_SHELL_H = 44;

const shellRadius = DRIVER_SWAP_SHELL_H / 2;

export const driverSwapAvatarStyles = StyleSheet.create({
  outer: {
    alignSelf: "flex-start",
    shadowColor: CHAT_ACCENT,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 2,
  },
  shellClip: {
    width: DRIVER_SWAP_SHELL_W,
    height: DRIVER_SWAP_SHELL_H,
    borderRadius: shellRadius,
    borderWidth: 1,
    borderColor: "rgba(91, 94, 244, 0.14)",
    overflow: "hidden",
    backgroundColor: "#F8F9FF",
    ...(Platform.OS === "web"
      ? ({ boxShadow: "0 2px 8px rgba(91, 94, 244, 0.08)" } as object)
      : {}),
  },
  shellGradient: {
    width: "100%",
    height: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: shellRadius,
    ...(Platform.OS === "web" ? ({ overflow: "hidden" } as object) : {}),
  },
  track: {
    position: "absolute",
    left: 22,
    right: 24,
    top: DRIVER_SWAP_SHELL_H / 2 - 0.5,
    height: 1.5,
    borderRadius: 1,
  },
  prevSlot: {
    position: "absolute",
    left: 7,
    top: (DRIVER_SWAP_SHELL_H - DRIVER_SWAP_PREV_SIZE) / 2,
    zIndex: 1,
  },
  arrowSlot: {
    position: "absolute",
    left: (DRIVER_SWAP_SHELL_W - 20) / 2,
    top: (DRIVER_SWAP_SHELL_H - 20) / 2,
    zIndex: 3,
  },
  arrowPill: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(91, 94, 244, 0.16)",
    backgroundColor: Theme.cardWhite,
  },
  nextSlot: {
    position: "absolute",
    right: 6,
    top: (DRIVER_SWAP_SHELL_H - DRIVER_SWAP_NEXT_SIZE) / 2,
    zIndex: 2,
  },
  nextHalo: {
    position: "absolute",
    width: DRIVER_SWAP_NEXT_SIZE + 6,
    height: DRIVER_SWAP_NEXT_SIZE + 6,
    borderRadius: (DRIVER_SWAP_NEXT_SIZE + 6) / 2,
    backgroundColor: "rgba(91, 94, 244, 0.07)",
    top: -3,
    left: -3,
  },
  avatarRing: {
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: CHAT_ACCENT_SOFT,
  },
  prevRing: {
    width: DRIVER_SWAP_PREV_SIZE,
    height: DRIVER_SWAP_PREV_SIZE,
    borderRadius: DRIVER_SWAP_PREV_SIZE / 2,
    borderWidth: 1,
    borderColor: "rgba(148, 163, 184, 0.32)",
  },
  prevFrost: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255, 255, 255, 0.45)",
    borderRadius: DRIVER_SWAP_PREV_SIZE / 2,
  },
  nextRing: {
    width: DRIVER_SWAP_NEXT_SIZE,
    height: DRIVER_SWAP_NEXT_SIZE,
    borderRadius: DRIVER_SWAP_NEXT_SIZE / 2,
    borderWidth: 1.5,
    borderColor: "rgba(91, 94, 244, 0.45)",
  },
  newRingPulse: {
    position: "absolute",
    width: DRIVER_SWAP_NEXT_SIZE + 6,
    height: DRIVER_SWAP_NEXT_SIZE + 6,
    borderRadius: (DRIVER_SWAP_NEXT_SIZE + 6) / 2,
    borderWidth: 1.5,
    borderColor: CHAT_ACCENT,
    top: -3,
    left: -3,
  },
  presenceDot: {
    position: "absolute",
    right: 0,
    bottom: 0,
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: CHAT_ACCENT,
    borderWidth: 1.5,
    borderColor: Theme.cardWhite,
    zIndex: 4,
  },
});
