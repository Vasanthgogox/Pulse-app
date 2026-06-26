/**
 * Inline header nudge — integrated party avatars + grow-network CTA with motion.
 * Palette: ink brown + Add Load sky blue + gold accent (Load Center tokens only).
 */
import Theme from "@/constants/Theme";
import { LOAD_CENTER_NETWORK_NUDGE_LOTTIE } from "@/features/network/components/loadCenterNetworkNudgeAssets";
import { LinearGradient } from "expo-linear-gradient";
import LottieView, { type AnimationObject } from "lottie-react-native";
import { useEffect, useRef } from "react";
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

export type LoadCenterNetworkGrowNudgeMode = "give" | "get";

type Props = {
  mode: LoadCenterNetworkGrowNudgeMode;
  onPress: () => void;
  compact?: boolean;
};

const INK = Theme.loadAddButtonText;
const INK_BORDER_SOFT = Theme.loadStatusTabBorderSoft;
const INK_BORDER_FAINT = Theme.loadStatusTabTrayBorder;
const SKY = Theme.loadAddButtonBg;
const SKY_WASH = Theme.pulseIndigoWash;
const SKY_TRAY = Theme.loadStatusTabTrayBg;
const MUTED = Theme.loadStatusTabTextMuted;
const IDLE_BG = Theme.loadStatusTabBgIdle;

const GOLD_MUTED = Theme.accentGoldMuted;
const GOLD_BORDER = Theme.accentGoldBorder;

const TRACK_GRADIENT = [Theme.cardWhite, SKY_TRAY, SKY_WASH] as const;

/** Shared vertical rhythm — avatar stack + nudge track align to this. */
export const LOAD_CENTER_NETWORK_NUDGE_TRACK_HEIGHT = 34;
export const LOAD_CENTER_NETWORK_NUDGE_TRACK_HEIGHT_COMPACT = 30;

const GIVE = {
  accent: INK,
  bg: GOLD_MUTED,
  border: GOLD_BORDER,
  ring: GOLD_BORDER,
};

const GET = {
  accent: INK,
  bg: SKY,
  border: INK_BORDER_SOFT,
  ring: Theme.pulseIndigoRing,
};

function NudgeLottie({
  source,
  size,
  renderScale = 1.7,
}: {
  source: AnimationObject;
  size: number;
  renderScale?: number;
}) {
  const render = Math.round(size * renderScale);
  return (
    <View style={[styles.lottieSlot, { width: size, height: size }]}>
      <LottieView
        source={source}
        autoPlay
        loop
        speed={0.85}
        resizeMode="contain"
        style={{
          width: render,
          height: render,
          position: "absolute",
          ...(Platform.OS === "web"
            ? { maxWidth: render, maxHeight: render }
            : null),
        }}
      />
    </View>
  );
}

function ActivePillPulse({
  active,
  ringColor,
}: {
  active: boolean;
  ringColor: string;
}) {
  const pulse = useRef(new Animated.Value(0.25)).current;

  useEffect(() => {
    if (!active) {
      pulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 0.7,
          duration: 1800,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.25,
          duration: 1800,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [active, pulse]);

  if (!active) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFillObject,
        styles.pillPulse,
        { borderColor: ringColor, opacity: pulse },
      ]}
    />
  );
}

function FlowPill({
  label,
  lottie,
  active,
  palette,
  compact,
}: {
  label: string;
  lottie: AnimationObject;
  active: boolean;
  palette: typeof GIVE;
  compact: boolean;
}) {
  const iconSize = compact ? 13 : 14;

  return (
    <View
      style={[
        styles.pill,
        compact && styles.pillCompact,
        {
          backgroundColor: active ? palette.bg : IDLE_BG,
          borderColor: active ? palette.border : INK_BORDER_FAINT,
        },
      ]}
    >
      <ActivePillPulse active={active} ringColor={palette.ring} />
      <NudgeLottie source={lottie} size={iconSize} renderScale={1.6} />
      <Text
        style={[
          styles.pillText,
          compact && styles.pillTextCompact,
          { color: active ? palette.accent : MUTED },
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

export function LoadCenterNetworkGrowNudge({
  mode,
  onPress,
  compact = false,
}: Props) {
  const trackHeight = compact
    ? LOAD_CENTER_NETWORK_NUDGE_TRACK_HEIGHT_COMPACT
    : LOAD_CENTER_NETWORK_NUDGE_TRACK_HEIGHT;
  const pressScale = useRef(new Animated.Value(1)).current;

  const onPressIn = () => {
    Animated.spring(pressScale, {
      toValue: 0.985,
      tension: 280,
      friction: 18,
      useNativeDriver: true,
    }).start();
  };

  const onPressOut = () => {
    Animated.spring(pressScale, {
      toValue: 1,
      tension: 220,
      friction: 16,
      useNativeDriver: true,
    }).start();
  };

  return (
    <Pressable
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      accessibilityRole="button"
      accessibilityLabel="Add more network to give load and get load"
      style={({ pressed }) => [pressed && styles.pressed]}
    >
      <Animated.View
        style={[
          styles.outer,
          compact && styles.outerCompact,
          { transform: [{ scale: pressScale }] },
        ]}
      >
        <LinearGradient
          colors={[...TRACK_GRADIENT]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[
            styles.shell,
            compact && styles.shellCompact,
            { minHeight: trackHeight },
          ]}
        >
          <View style={[styles.iconHalo, compact && styles.iconHaloCompact]}>
            <NudgeLottie
              source={LOAD_CENTER_NETWORK_NUDGE_LOTTIE.invite}
              size={compact ? 18 : 20}
              renderScale={1.75}
            />
          </View>

          <Text
            style={[styles.lead, compact && styles.leadCompact]}
            numberOfLines={1}
          >
            Add more network to
          </Text>

          <View style={styles.chipGroup}>
            <FlowPill
              label="Give load"
              lottie={LOAD_CENTER_NETWORK_NUDGE_LOTTIE.give}
              active={mode === "give"}
              palette={GIVE}
              compact={compact}
            />
            <View style={styles.connector} />
            <FlowPill
              label="Get load"
              lottie={LOAD_CENTER_NETWORK_NUDGE_LOTTIE.get}
              active={mode === "get"}
              palette={GET}
              compact={compact}
            />
          </View>
        </LinearGradient>
      </Animated.View>
    </Pressable>
  );
}

const shellShadow = Platform.select({
  web: {
    boxShadow: "0 1px 2px rgba(77, 54, 54, 0.06), 0 4px 14px rgba(205, 233, 247, 0.35)",
  } as object,
  ios: {
    shadowColor: "#4D3636",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
  },
  android: { elevation: 1 },
  default: {},
});

const styles = StyleSheet.create({
  outer: {
    minWidth: 0,
    flexShrink: 1,
    maxWidth: 480,
  },
  outerCompact: {
    maxWidth: "100%",
  },
  pressed: {
    opacity: 0.92,
  },
  shell: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minWidth: 0,
    flexShrink: 1,
    paddingVertical: 4,
    paddingLeft: 5,
    paddingRight: 8,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: INK_BORDER_FAINT,
    overflow: "hidden",
    backgroundColor: Theme.cardWhite,
    ...shellShadow,
  },
  shellCompact: {
    gap: 8,
    paddingLeft: 4,
    paddingRight: 6,
    flexWrap: "nowrap",
  },
  iconHalo: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    backgroundColor: GOLD_MUTED,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: GOLD_BORDER,
  },
  iconHaloCompact: {
    width: 22,
    height: 22,
    borderRadius: 11,
  },
  lottieSlot: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  lead: {
    fontSize: 10,
    fontWeight: "500",
    color: MUTED,
    letterSpacing: 0.02,
    flexShrink: 1,
    lineHeight: 14,
    includeFontPadding: false,
  },
  leadCompact: {
    fontSize: 9,
    lineHeight: 12,
  },
  chipGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 0,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 0,
    minHeight: 24,
    borderWidth: StyleSheet.hairlineWidth,
    flexShrink: 0,
    position: "relative",
    overflow: "hidden",
  },
  pillCompact: {
    paddingHorizontal: 7,
    minHeight: 22,
    gap: 4,
  },
  pillPulse: {
    borderRadius: 999,
    borderWidth: 1,
  },
  pillText: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: -0.1,
    lineHeight: 13,
    includeFontPadding: false,
  },
  pillTextCompact: {
    fontSize: 9,
    lineHeight: 12,
  },
  connector: {
    width: 12,
    height: StyleSheet.hairlineWidth,
    borderRadius: 1,
    backgroundColor: INK_BORDER_SOFT,
    flexShrink: 0,
    opacity: 0.85,
  },
});
