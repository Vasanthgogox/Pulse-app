/**
 * Get Load empty-state promo — add clients on Pulse Network.
 */
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { LinearGradient } from "expo-linear-gradient";
import {
  ArrowRight,
  Building2,
  Package,
  UserPlus,
  Zap,
} from "lucide-react-native";
import { useEffect, useRef, type ReactNode } from "react";
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from "react-native";

const GRADIENT = ["#6366F1", "#4F46E5", "#4338CA"] as const;

const cardShadow = Platform.select<ViewStyle>({
  ios: {
    shadowColor: Theme.actionAccent,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.28,
    shadowRadius: 18,
  },
  android: { elevation: 6 },
  web: {
    boxShadow:
      "0 12px 28px rgba(79, 70, 229, 0.28), 0 0 0 1px rgba(255,255,255,0.12) inset",
  },
  default: {},
});

export type LoadCenterPulseConnectCardProps = {
  onPress: () => void;
};

type OrbitNodeProps = {
  style: ViewStyle;
  delayMs: number;
  children: ReactNode;
};

function OrbitNode3D({ style, delayMs, children }: OrbitNodeProps) {
  const floatY = useRef(new Animated.Value(0)).current;
  const pop = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const floatLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(floatY, {
          toValue: -6,
          duration: 1400 + delayMs,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(floatY, {
          toValue: 0,
          duration: 1400 + delayMs,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    const popLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pop, {
          toValue: 1.06,
          duration: 2000 + delayMs * 0.4,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pop, {
          toValue: 1,
          duration: 2000 + delayMs * 0.4,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    floatLoop.start();
    popLoop.start();
    return () => {
      floatLoop.stop();
      popLoop.stop();
    };
  }, [delayMs, floatY, pop]);

  return (
    <Animated.View
      style={[
        style,
        {
          transform: [{ translateY: floatY }, { scale: pop }],
        },
      ]}
    >
      <View style={styles.nodeShadow} />
      <View style={styles.nodeFace}>{children}</View>
    </Animated.View>
  );
}

function PulseConnectIllustration() {
  const hubScale = useRef(new Animated.Value(1)).current;
  const hubGlow = useRef(new Animated.Value(0.35)).current;
  const orbitSpin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const hubPulse = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(hubScale, {
            toValue: 1.08,
            duration: 900,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(hubGlow, {
            toValue: 0.65,
            duration: 900,
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(hubScale, {
            toValue: 1,
            duration: 900,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(hubGlow, {
            toValue: 0.35,
            duration: 900,
            useNativeDriver: true,
          }),
        ]),
      ]),
    );
    const spin = Animated.loop(
      Animated.timing(orbitSpin, {
        toValue: 1,
        duration: 18000,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    hubPulse.start();
    spin.start();
    return () => {
      hubPulse.stop();
      spin.stop();
    };
  }, [hubGlow, hubScale, orbitSpin]);

  const spinDeg = orbitSpin.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  return (
    <View style={styles.illustrationStage} accessibilityElementsHidden>
      <Animated.View
        style={[styles.illustrationAura, { opacity: hubGlow }]}
        pointerEvents="none"
      />
      <Animated.View
        style={[styles.orbitRing, { transform: [{ rotate: spinDeg }] }]}
        pointerEvents="none"
      >
        <View style={styles.orbitTrack} />
      </Animated.View>
      <View style={styles.illustrationOrbit}>
        <OrbitNode3D style={styles.nodeTop} delayMs={0}>
          <Building2 size={17} color={Theme.primary} strokeWidth={2.2} />
        </OrbitNode3D>
        <OrbitNode3D style={styles.nodeLeft} delayMs={280}>
          <UserPlus size={16} color={Theme.primary} strokeWidth={2.2} />
        </OrbitNode3D>
        <OrbitNode3D style={styles.nodeRight} delayMs={520}>
          <Package size={16} color={Theme.primary} strokeWidth={2.2} />
        </OrbitNode3D>
        <Animated.View
          style={[styles.hubStack, { transform: [{ scale: hubScale }] }]}
        >
          <View style={styles.hubShadow} />
          <View style={styles.hubRing}>
            <LinearGradient
              colors={["#818CF8", Theme.primary, "#3730A3"]}
              start={{ x: 0.2, y: 0 }}
              end={{ x: 0.9, y: 1 }}
              style={styles.hubCore}
            >
              <Zap
                size={22}
                color={Theme.textOnDark}
                strokeWidth={2.4}
                fill={Theme.textOnDark}
              />
            </LinearGradient>
          </View>
        </Animated.View>
        <View style={[styles.linkBar, styles.linkTop]} />
        <View style={[styles.linkBar, styles.linkLeft]} />
        <View style={[styles.linkBar, styles.linkRight]} />
      </View>
    </View>
  );
}

export function LoadCenterPulseConnectCard({
  onPress,
}: LoadCenterPulseConnectCardProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.shell,
        cardShadow,
        pressed && styles.shellPressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel="Add more clients to your network in Pulse. Go to Network."
    >
      <LinearGradient
        colors={[...GRADIENT]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradient}
      >
        <View style={styles.decorCircleLarge} pointerEvents="none" />
        <View style={styles.decorCircleSmall} pointerEvents="none" />
        <PulseConnectIllustration />
        <Text style={styles.title}>
          Add more clients to your network in Pulse
        </Text>
        <Text style={styles.sub}>
          Connect with shippers and partners — open loads from your network will
          show up here.
        </Text>
        <View style={styles.ctaRow}>
          <Text style={styles.ctaLabel}>Go to Network</Text>
          <ArrowRight size={16} color={Theme.primary} strokeWidth={2.5} />
        </View>
      </LinearGradient>
    </Pressable>
  );
}

const STAGE = 148;
const NODE = 36;

const styles = StyleSheet.create({
  shell: {
    marginHorizontal: Layout.screenPaddingHorizontal,
    borderRadius: 20,
    overflow: "hidden",
  },
  shellPressed: {
    opacity: 0.94,
    transform: [{ scale: 0.99 }],
  },
  gradient: {
    borderRadius: 20,
    paddingTop: 22,
    paddingBottom: 20,
    paddingHorizontal: 20,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  decorCircleLarge: {
    position: "absolute",
    top: -36,
    right: -24,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  decorCircleSmall: {
    position: "absolute",
    bottom: -20,
    left: -12,
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  illustrationStage: {
    width: STAGE,
    height: STAGE,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  illustrationAura: {
    position: "absolute",
    width: STAGE - 4,
    height: STAGE - 4,
    borderRadius: (STAGE - 4) / 2,
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  orbitRing: {
    position: "absolute",
    width: STAGE - 20,
    height: STAGE - 20,
    alignItems: "center",
    justifyContent: "center",
  },
  orbitTrack: {
    width: "100%",
    height: "100%",
    borderRadius: (STAGE - 20) / 2,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    borderStyle: "dashed",
  },
  illustrationOrbit: {
    width: STAGE,
    height: STAGE,
    alignItems: "center",
    justifyContent: "center",
  },
  hubStack: {
    alignItems: "center",
    justifyContent: "center",
  },
  hubShadow: {
    position: "absolute",
    bottom: -6,
    width: 44,
    height: 12,
    borderRadius: 22,
    backgroundColor: "rgba(30,27,75,0.45)",
  },
  hubRing: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "rgba(255,255,255,0.22)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.4)",
  },
  hubCore: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
  },
  nodeShadow: {
    position: "absolute",
    bottom: -4,
    width: NODE - 6,
    height: 8,
    borderRadius: 8,
    backgroundColor: "rgba(30,27,75,0.35)",
    alignSelf: "center",
  },
  nodeFace: {
    width: NODE,
    height: NODE,
    borderRadius: NODE / 2,
    backgroundColor: Theme.textOnDark,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "rgba(199,210,254,0.55)",
    ...Platform.select({
      ios: {
        shadowColor: "#312e81",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.25,
        shadowRadius: 6,
      },
      android: { elevation: 5 },
      default: {},
    }),
  },
  nodeTop: {
    position: "absolute",
    top: 6,
  },
  nodeLeft: {
    position: "absolute",
    left: 4,
    bottom: 22,
  },
  nodeRight: {
    position: "absolute",
    right: 4,
    bottom: 22,
  },
  linkBar: {
    position: "absolute",
    backgroundColor: "rgba(255,255,255,0.38)",
    borderRadius: 2,
  },
  linkTop: {
    width: 2,
    height: 16,
    top: 38,
  },
  linkLeft: {
    width: 20,
    height: 2,
    left: 32,
    bottom: 44,
    transform: [{ rotate: "-28deg" }],
  },
  linkRight: {
    width: 20,
    height: 2,
    right: 32,
    bottom: 44,
    transform: [{ rotate: "28deg" }],
  },
  title: {
    fontSize: 16,
    fontWeight: "800",
    color: Theme.textOnDark,
    lineHeight: 22,
    letterSpacing: -0.2,
    textAlign: "center",
    paddingHorizontal: 4,
  },
  sub: {
    marginTop: 10,
    fontSize: 12,
    fontWeight: "500",
    color: "rgba(255,255,255,0.84)",
    lineHeight: 17,
    textAlign: "center",
    maxWidth: 300,
  },
  ctaRow: {
    marginTop: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Theme.textOnDark,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 999,
  },
  ctaLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.primary,
  },
});
