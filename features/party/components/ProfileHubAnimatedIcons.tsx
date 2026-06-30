/**
 * Profile hub — Lottie icons and header action buttons (matches HomePageHeader bell UI).
 */
import LottieView from "lottie-react-native";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";

const LOTTIE = {
  chat: require("@/assets/Animated folder/Chat.json"),
  truck: require("@/assets/Animated folder/truck.json"),
  deliveryComplete: require("@/assets/Animated folder/delivery completed.json"),
  payment: require("@/assets/Animated folder/payment.json"),
  savings: require("@/assets/Animated folder/savings.json"),
  contract: require("@/assets/Animated folder/law approved.json"),
  fleet: require("@/assets/Animated folder/truck-2.json"),
  drivers: require("@/assets/Animated folder/add-user.json"),
  warehouse: require("@/assets/Animated folder/warehouse-management.json"),
  security: require("@/assets/Animated folder/security.json"),
  signals: require("@/assets/Animated folder/signals.json"),
  logistics: require("@/assets/Animated folder/logistics.json"),
} as const;

export type ProfileHubLottieKey = keyof typeof LOTTIE;

export type ProfileHubLottieIconProps = {
  name: ProfileHubLottieKey;
  size?: number;
  glyphScale?: number;
  active?: boolean;
};

export function ProfileHubLottieIcon({
  name,
  size = 32,
  glyphScale = 1.1,
  active = false,
}: ProfileHubLottieIconProps) {
  const dim = Math.round(size * glyphScale);

  return (
    <View style={[styles.lottieSlot, { width: size, height: size }]}>
      <LottieView
        source={LOTTIE[name]}
        autoPlay
        loop
        speed={active ? 1.15 : 1}
        resizeMode="contain"
        style={{ width: dim, height: dim }}
      />
    </View>
  );
}

const ICON_BTN_SIZE = 40;

export function ProfileHubHeaderIconButton({
  onPress,
  accessibilityLabel,
  children,
}: {
  onPress: () => void;
  accessibilityLabel: string;
  children: ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={6}
    >
      {children}
    </Pressable>
  );
}

export function ProfileHubChatActionIcon({
  size = 36,
  active = false,
}: {
  size?: number;
  active?: boolean;
}) {
  return (
    <ProfileHubLottieIcon
      name="chat"
      size={size}
      glyphScale={1.15}
      active={active}
    />
  );
}

const styles = StyleSheet.create({
  lottieSlot: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "visible",
  },
  iconBtn: {
    width: ICON_BTN_SIZE,
    height: ICON_BTN_SIZE,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    overflow: "visible",
  },
  pressed: {
    opacity: 0.88,
    transform: [{ scale: 0.94 }],
  },
});
