/**
 * Live bids hub — small Lottie + pulse glyphs for headers, cards, and alert lines.
 */
import LottieView from "lottie-react-native";
import type { LottieSource } from "@/lib/lottieSource";
import { useEffect, useRef, type ReactNode } from "react";
import { AlertTriangle, Clock3 } from "lucide-react-native";
import { Animated, Platform, StyleSheet, View } from "react-native";

import Theme from "@/constants/Theme";

const LOTTIE = {
  trophy: require("@/assets/Animated folder/trophy.json"),
  auction: require("@/assets/Animated folder/auction.json"),
  signals: require("@/assets/Animated folder/signals.json"),
  medal: require("@/assets/Animated folder/medal.json"),
} as const;

const RENDER_SCALE = 1.65;

type LottieGlyphProps = {
  source: LottieSource;
  size?: number;
  speed?: number;
  loop?: boolean;
};

export function IndentHubLottieGlyph({
  source,
  size = 16,
  speed = 1,
  loop = true,
}: LottieGlyphProps) {
  const renderSize = Math.round(size * RENDER_SCALE);
  const offset = (size - renderSize) / 2;

  return (
    <View style={[styles.slot, { width: size, height: size }]}>
      <LottieView
        source={source}
        autoPlay
        loop={loop}
        speed={speed}
        resizeMode="contain"
        style={{
          width: renderSize,
          height: renderSize,
          position: "absolute",
          left: offset,
          top: offset,
        }}
      />
    </View>
  );
}

export function IndentHubTrophyGlyph({ size = 16 }: { size?: number }) {
  return <IndentHubLottieGlyph source={LOTTIE.trophy} size={size} speed={0.92} />;
}

export function IndentHubAuctionGlyph({ size = 16 }: { size?: number }) {
  return <IndentHubLottieGlyph source={LOTTIE.auction} size={size} speed={1.05} />;
}

export function IndentHubLiveSignalGlyph({ size = 14 }: { size?: number }) {
  return <IndentHubLottieGlyph source={LOTTIE.signals} size={size} speed={1.1} />;
}

export function IndentHubMedalGlyph({ size = 12 }: { size?: number }) {
  return <IndentHubLottieGlyph source={LOTTIE.medal} size={size} speed={0.95} />;
}

export function IndentHubLivePulseDot() {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(scale, {
            toValue: 1.45,
            duration: 850,
            useNativeDriver: Platform.OS !== "web",
          }),
          Animated.timing(scale, {
            toValue: 1,
            duration: 850,
            useNativeDriver: Platform.OS !== "web",
          }),
        ]),
        Animated.sequence([
          Animated.timing(opacity, {
            toValue: 0.95,
            duration: 850,
            useNativeDriver: Platform.OS !== "web",
          }),
          Animated.timing(opacity, {
            toValue: 0.35,
            duration: 850,
            useNativeDriver: Platform.OS !== "web",
          }),
        ]),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [opacity, scale]);

  return (
    <View style={styles.pulseDotWrap}>
      <Animated.View
        style={[
          styles.pulseDotRing,
          { transform: [{ scale }], opacity },
        ]}
      />
      <View style={styles.pulseDotCore} />
    </View>
  );
}

function usePulseScale() {
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1.14,
          duration: 520,
          useNativeDriver: Platform.OS !== "web",
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 520,
          useNativeDriver: Platform.OS !== "web",
        }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [pulse]);

  return pulse;
}

export function IndentHubAlertPulseIcon({
  color,
  size = 12,
}: {
  color: string;
  size?: number;
}) {
  const pulse = usePulseScale();

  return (
    <Animated.View style={{ transform: [{ scale: pulse }] }}>
      <AlertTriangle size={size} color={color} strokeWidth={2.2} />
    </Animated.View>
  );
}

export function IndentHubClockPulseIcon({
  color,
  size = 12,
}: {
  color: string;
  size?: number;
}) {
  const pulse = usePulseScale();

  return (
    <Animated.View style={{ transform: [{ scale: pulse }] }}>
      <Clock3 size={size} color={color} strokeWidth={2.2} />
    </Animated.View>
  );
}

export type IndentHubBidKickerVariant = "awarded" | "live" | "rejected";

export function IndentHubBidKickerGlyph({
  variant,
}: {
  variant: IndentHubBidKickerVariant;
}) {
  switch (variant) {
    case "awarded":
      return <IndentHubTrophyGlyph size={12} />;
    case "live":
      return <IndentHubLiveSignalGlyph size={12} />;
    case "rejected":
      return <IndentHubAlertPulseIcon color={Theme.teslaRed} size={11} />;
    default:
      return null;
  }
}

/** Fixed-width slot so alert lines align when icons differ in size. */
export function IndentHubGlyphSlot({
  size = 14,
  children,
  alignTop = false,
}: {
  size?: number;
  children: ReactNode;
  alignTop?: boolean;
}) {
  return (
    <View
      style={[
        styles.glyphSlot,
        { width: size, height: size },
        alignTop && styles.glyphSlotTop,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  slot: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "visible",
  },
  glyphSlot: {
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    overflow: "visible",
  },
  glyphSlotTop: {
    marginTop: 1,
  },
  pulseDotWrap: {
    width: 10,
    height: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  pulseDotRing: {
    position: "absolute",
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Theme.positive,
  },
  pulseDotCore: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: Theme.positive,
  },
});
