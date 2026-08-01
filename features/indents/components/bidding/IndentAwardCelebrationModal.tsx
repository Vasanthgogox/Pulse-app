/**
 * Award success celebration — Load Detail Hub style.
 * Checkmark + amount/margin summary + confetti burst (RN Animated, no canvas).
 */
import { memo, useEffect, useMemo, useRef } from "react";
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { indentReviewHubText } from "@/features/indents/styles/indentReviewHubStyles";
import { formatINR } from "@/lib/format";

export type IndentAwardCelebrationData = {
  carrier: string;
  finalAmount: number;
  margin: number;
  marginPercent: string;
};

export type IndentAwardCelebrationModalProps = {
  visible: boolean;
  data: IndentAwardCelebrationData | null;
  onClose: () => void;
};

const PARTICLE_COUNT = 28;
const PARTICLE_COLORS = [
  Theme.driverPrimary,
  Theme.positiveMuted,
  Theme.accentGold,
  Theme.brandBlueSoft,
  Theme.driverEmerald,
  Theme.warningMuted,
];

function stripCurrency(formatted: string): string {
  return formatted.replace(/^[^\d,.-]+/, "").trim() || formatted;
}

export const IndentAwardCelebrationModal = memo(
  function IndentAwardCelebrationModal({
    visible,
    data,
    onClose,
  }: IndentAwardCelebrationModalProps) {
    const insets = useSafeAreaInsets();
    const scale = useRef(new Animated.Value(0.6)).current;
    const opacity = useRef(new Animated.Value(0)).current;
    const particles = useMemo(
      () =>
        Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
          id: i,
          color: PARTICLE_COLORS[i % PARTICLE_COLORS.length],
          x: (Math.random() - 0.5) * 280,
          delay: Math.random() * 180,
          size: 5 + Math.random() * 7,
          rotate: Math.random() * 360,
          fall: 280 + Math.random() * 120,
        })),
      // recreate burst each open
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [visible],
    );
    const particleAnims = useRef(
      Array.from({ length: PARTICLE_COUNT }, () => ({
        y: new Animated.Value(0),
        o: new Animated.Value(0),
      })),
    ).current;

    useEffect(() => {
      if (!visible) {
        scale.setValue(0.6);
        opacity.setValue(0);
        return;
      }
      Animated.parallel([
        Animated.spring(scale, {
          toValue: 1,
          friction: 7,
          tension: 80,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }),
      ]).start();

      particleAnims.forEach((p, i) => {
        p.y.setValue(0);
        p.o.setValue(0);
        const pt = particles[i];
        Animated.sequence([
          Animated.delay(pt?.delay ?? 0),
          Animated.parallel([
            Animated.timing(p.o, {
              toValue: 1,
              duration: 120,
              useNativeDriver: true,
            }),
            Animated.timing(p.y, {
              toValue: 1,
              duration: 1400 + (pt?.delay ?? 0),
              easing: Easing.out(Easing.quad),
              useNativeDriver: true,
            }),
          ]),
          Animated.timing(p.o, {
            toValue: 0,
            duration: 280,
            useNativeDriver: true,
          }),
        ]).start();
      });
    }, [visible, opacity, scale, particleAnims, particles]);

    if (!data) return null;

    return (
      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={onClose}
      >
        <View style={styles.backdrop}>
          {particles.map((pt, i) => {
            const anim = particleAnims[i];
            if (!anim) return null;
            return (
              <Animated.View
                key={pt.id}
                pointerEvents="none"
                style={[
                  styles.particle,
                  {
                    width: pt.size,
                    height: pt.size * 1.4,
                    backgroundColor: pt.color,
                    transform: [
                      { translateX: pt.x },
                      {
                        translateY: anim.y.interpolate({
                          inputRange: [0, 1],
                          outputRange: [40, pt.fall],
                        }),
                      },
                      { rotate: `${pt.rotate}deg` },
                    ],
                    opacity: anim.o,
                  },
                ]}
              />
            );
          })}

          <Animated.View
            style={[
              styles.card,
              {
                marginBottom: Math.max(insets.bottom, 16),
                opacity,
                transform: [{ scale }],
              },
            ]}
          >
            <Pressable onPress={(e) => e.stopPropagation()}>
              <View style={styles.checkRing}>
                <View style={styles.checkCircle}>
                  <FontAwesome
                    name="check-circle"
                    size={42}
                    color={Theme.driverPrimary}
                  />
                </View>
              </View>

              <Text style={styles.title}>Load Successfully Awarded!</Text>
              <Text style={styles.body}>
                Awarded to{" "}
                <Text style={styles.bodyEm}>{data.carrier}</Text>. They can
                assign staff and deploy from Load Center → Claimed.
              </Text>

              <View style={styles.metrics}>
                <View style={styles.metricCol}>
                  <Text style={styles.metricLabel}>Awarded Amount</Text>
                  <Text style={styles.metricValue}>
                    ₹ {stripCurrency(formatINR(data.finalAmount))}
                  </Text>
                </View>
                <View style={styles.metricCol}>
                  <Text style={styles.metricLabel}>Achieved Margin</Text>
                  <Text style={[styles.metricValue, styles.metricPositive]}>
                    ₹ {stripCurrency(formatINR(data.margin))} (
                    {data.marginPercent}%)
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                style={styles.cta}
                onPress={onClose}
                activeOpacity={0.9}
                accessibilityLabel="Return to overview"
              >
                <Text style={styles.ctaText}>Return to Overview</Text>
              </TouchableOpacity>
            </Pressable>
          </Animated.View>
        </View>
      </Modal>
    );
  },
);

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(2,6,23,0.82)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: Layout.screenPaddingHorizontal,
  },
  particle: {
    position: "absolute",
    top: "28%",
    left: "50%",
    borderRadius: 2,
  },
  card: {
    backgroundColor: Theme.cardWhite,
    borderRadius: 28,
    padding: 28,
    borderWidth: 1,
    borderColor: Theme.positiveMutedDarkBorder,
    maxWidth: 440,
    width: "100%",
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 12,
  },
  checkRing: {
    alignSelf: "center",
    marginBottom: 16,
    padding: 10,
    borderRadius: 999,
    backgroundColor: Theme.positiveMuted,
  },
  checkCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.positiveMuted,
  },
  title: {
    fontSize: 22,
    fontWeight: "900",
    textAlign: "center",
    color: Theme.textPrimaryDark,
    marginBottom: 6,
  },
  body: {
    ...indentReviewHubText.bodyMuted,
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
  },
  bodyEm: {
    fontWeight: "800",
    color: Theme.textPrimaryDark,
  },
  metrics: {
    marginTop: 20,
    marginBottom: 22,
    padding: 14,
    borderRadius: 16,
    backgroundColor: Theme.surfaceGray,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    flexDirection: "row",
    gap: 12,
  },
  metricCol: { flex: 1, minWidth: 0 },
  metricLabel: {
    ...indentReviewHubText.fieldLabel,
    fontSize: 9,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  metricValue: {
    fontSize: 16,
    fontWeight: "900",
    fontVariant: ["tabular-nums"],
    color: Theme.textPrimaryDark,
  },
  metricPositive: {
    color: Theme.driverPrimary,
  },
  cta: {
    backgroundColor: Theme.darkBackground,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: "center",
    minHeight: 48,
    justifyContent: "center",
  },
  ctaText: {
    ...indentReviewHubText.buttonLabel,
    fontSize: 11,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: Theme.textOnDark,
  },
});
