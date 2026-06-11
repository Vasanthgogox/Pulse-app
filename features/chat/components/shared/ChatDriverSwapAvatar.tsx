import React, { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { ArrowRight } from "lucide-react-native";
import { CHAT_ACCENT, CHAT_ACCENT_SOFT } from "@/features/chat/chatTheme";
import Theme from "@/constants/Theme";
import type { DriverSwapPair } from "../../utils/chatAvatar.util";
import { ChatPartyAvatar } from "../ChatPartyAvatar";

const PREV_SIZE = 28;
const NEXT_SIZE = 34;
const SHELL_W = 96;
const SHELL_H = 46;

export function ChatDriverSwapAvatar({ swap }: { swap: DriverSwapPair }) {
  const entrance = useRef(new Animated.Value(0)).current;
  const swapProgress = useRef(new Animated.Value(0)).current;
  const arrowPulse = useRef(new Animated.Value(0)).current;
  const livePulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    entrance.setValue(0);
    swapProgress.setValue(0);

    Animated.sequence([
      Animated.timing(entrance, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(swapProgress, {
        toValue: 1,
        speed: 12,
        bounciness: 9,
        useNativeDriver: true,
      }),
    ]).start();
  }, [entrance, swapProgress, swap.previous.displayName, swap.next.displayName]);

  useEffect(() => {
    const arrowLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(arrowPulse, {
          toValue: 1,
          duration: 1100,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(arrowPulse, {
          toValue: 0,
          duration: 1100,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    const liveLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(livePulse, {
          toValue: 1,
          duration: 950,
          useNativeDriver: true,
        }),
        Animated.timing(livePulse, {
          toValue: 0,
          duration: 950,
          useNativeDriver: true,
        }),
      ]),
    );
    arrowLoop.start();
    liveLoop.start();
    return () => {
      arrowLoop.stop();
      liveLoop.stop();
    };
  }, [arrowPulse, livePulse]);

  const shellScale = entrance.interpolate({
    inputRange: [0, 1],
    outputRange: [0.9, 1],
  });
  const shellOpacity = entrance;

  const prevTranslateX = swapProgress.interpolate({
    inputRange: [0, 0.45, 1],
    outputRange: [12, 5, 0],
  });
  const prevOpacity = swapProgress.interpolate({
    inputRange: [0, 0.2, 1],
    outputRange: [0, 0.45, 0.78],
  });
  const prevScale = swapProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0.84, 0.94],
  });

  const arrowOpacity = swapProgress.interpolate({
    inputRange: [0, 0.35, 1],
    outputRange: [0, 0.55, 1],
  });
  const arrowTranslateX = Animated.add(
    swapProgress.interpolate({
      inputRange: [0, 1],
      outputRange: [-5, 0],
    }),
    arrowPulse.interpolate({
      inputRange: [0, 1],
      outputRange: [0, 3],
    }),
  );
  const arrowScale = swapProgress.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.5, 0.88, 1],
  });

  const nextTranslateX = swapProgress.interpolate({
    inputRange: [0, 0.55, 1],
    outputRange: [18, 7, 0],
  });
  const nextOpacity = swapProgress.interpolate({
    inputRange: [0, 0.4, 1],
    outputRange: [0, 0.65, 1],
  });
  const nextScale = swapProgress.interpolate({
    inputRange: [0, 0.6, 1],
    outputRange: [0.74, 0.96, 1],
  });

  const ringOpacity = livePulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.38, 0],
  });
  const ringScale = livePulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.2],
  });

  return (
    <Animated.View
      style={[
        styles.outer,
        {
          opacity: shellOpacity,
          transform: [{ scale: shellScale }],
        },
      ]}
    >
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

        <Animated.View
          style={[
            styles.prevSlot,
            {
              opacity: prevOpacity,
              transform: [{ translateX: prevTranslateX }, { scale: prevScale }],
            },
          ]}
        >
          <View style={[styles.avatarRing, styles.prevRing]}>
            <ChatPartyAvatar identity={swap.previous} size={PREV_SIZE} />
            <View style={styles.prevFrost} pointerEvents="none" />
          </View>
        </Animated.View>

        <Animated.View
          style={[
            styles.arrowSlot,
            {
              opacity: arrowOpacity,
              transform: [{ translateX: arrowTranslateX }, { scale: arrowScale }],
            },
          ]}
        >
          <LinearGradient
            colors={[Theme.cardWhite, CHAT_ACCENT_SOFT]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.arrowPill}
          >
            <ArrowRight size={11} color={CHAT_ACCENT} strokeWidth={2.6} />
          </LinearGradient>
        </Animated.View>

        <Animated.View
          style={[
            styles.nextSlot,
            {
              opacity: nextOpacity,
              transform: [{ translateX: nextTranslateX }, { scale: nextScale }],
            },
          ]}
        >
          <Animated.View
            pointerEvents="none"
            style={[
              styles.newRingPulse,
              {
                opacity: ringOpacity,
                transform: [{ scale: ringScale }],
              },
            ]}
          />
          <View style={styles.nextHalo} pointerEvents="none" />
          <View style={[styles.avatarRing, styles.nextRing]}>
            <ChatPartyAvatar identity={swap.next} size={NEXT_SIZE} />
          </View>
          <Animated.View
            style={[
              styles.presenceDot,
              {
                transform: [
                  {
                    scale: livePulse.interpolate({
                      inputRange: [0, 1],
                      outputRange: [1, 1.12],
                    }),
                  },
                ],
              },
            ]}
          />
        </Animated.View>
      </LinearGradient>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  outer: {
    shadowColor: CHAT_ACCENT,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
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
    top: 8,
    zIndex: 1,
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
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.22,
    shadowRadius: 6,
    elevation: 2,
  },
  newRingPulse: {
    position: "absolute",
    width: NEXT_SIZE + 10,
    height: NEXT_SIZE + 10,
    borderRadius: (NEXT_SIZE + 10) / 2,
    borderWidth: 2,
    borderColor: CHAT_ACCENT,
    top: -5,
    left: -5,
  },
  presenceDot: {
    position: "absolute",
    right: 1,
    bottom: 1,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: CHAT_ACCENT,
    borderWidth: 2,
    borderColor: Theme.cardWhite,
    zIndex: 4,
  },
});
