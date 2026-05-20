/**
 * Pulse-style loading chrome (indigo node + expanding rings + heartbeat icon).
 * React Native port of the Pulse web loader — use via `LoadingIndicator` or `CenteredLoadingView`.
 */
import { LinearGradient } from "expo-linear-gradient";
import { Activity } from "lucide-react-native";
import { MotiView } from "moti";
import { StyleSheet, Text, View } from "react-native";
import Theme from "@/constants/Theme";

const INDIGO = Theme.pulseIndigo;
const INDIGO_RING = Theme.pulseIndigoRing;
const INDIGO_RING_SOFT = Theme.pulseIndigoWash;

export type PulseLoaderVariant = "compact" | "medium" | "full";

export interface PulseLoaderProps {
  /** Shown under the node on `full` (and `medium` when non-empty). */
  label?: string;
  variant?: PulseLoaderVariant;
}

const SIZES: Record<
  PulseLoaderVariant,
  { ring: number; core: number; icon: number; labelSize: number }
> = {
  compact: { ring: 52, core: 30, icon: 16, labelSize: 0 },
  medium: { ring: 96, core: 52, icon: 28, labelSize: 11 },
  full: { ring: 208, core: 96, icon: 44, labelSize: 12 },
};

function PulseRing({
  size,
  borderColor,
  borderWidth,
  delayMs,
}: {
  size: number;
  borderColor: string;
  borderWidth: number;
  delayMs: number;
}) {
  return (
    <MotiView
      style={[
        styles.ring,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth,
          borderColor,
        },
      ]}
      from={{ scale: 0.35, opacity: 0.95 }}
      animate={{ scale: 1.65, opacity: 0 }}
      transition={{
        type: "timing",
        duration: 3000,
        loop: true,
        delay: delayMs,
      }}
    />
  );
}

function BouncingDots() {
  return (
    <View style={styles.dotsRow}>
      {[0, 1, 2].map((i) => (
        <MotiView
          key={i}
          style={styles.dot}
          from={{ translateY: 0, opacity: 0.25 }}
          animate={{ translateY: -5, opacity: 0.9 }}
          transition={{
            type: "timing",
            duration: 450,
            loop: true,
            delay: i * 160,
            repeatReverse: true,
          }}
        />
      ))}
    </View>
  );
}

export function PulseLoader({
  label = "Synchronizing…",
  variant = "full",
}: PulseLoaderProps) {
  const s = SIZES[variant];
  const showCopy = Boolean(label) && (variant === "full" || variant === "medium");

  return (
    <View
      style={[
        styles.root,
        variant === "compact" && styles.rootCompact,
        variant === "medium" && styles.rootMedium,
      ]}
      accessibilityRole="progressbar"
      accessibilityLabel={label}
    >
      <View style={[styles.nodeWrap, { width: s.ring, height: s.ring }]}>
        <PulseRing
          size={s.ring}
          borderColor={INDIGO_RING}
          borderWidth={variant === "compact" ? 1 : 1.5}
          delayMs={0}
        />
        {variant !== "compact" ? (
          <PulseRing
            size={s.ring}
            borderColor={INDIGO_RING_SOFT}
            borderWidth={1}
            delayMs={500}
          />
        ) : null}

        <View
          style={[
            styles.core,
            {
              width: s.core,
              height: s.core,
              borderRadius: variant === "compact" ? 12 : 24,
            },
          ]}
        >
          <LinearGradient
            colors={["rgba(255,255,255,0.12)", "transparent"]}
            style={StyleSheet.absoluteFill}
            start={{ x: 0.5, y: 1 }}
            end={{ x: 0.5, y: 0 }}
          />
          <MotiView
            from={{ scale: 1 }}
            animate={{ scale: 1.12 }}
            transition={{
              type: "timing",
              duration: 750,
              loop: true,
              repeatReverse: true,
            }}
          >
            <Activity size={s.icon} color="#fff" strokeWidth={2.4} />
          </MotiView>
        </View>
      </View>

      {showCopy ? (
        <View style={styles.copyBlock}>
          <Text
            style={[
              styles.label,
              { fontSize: s.labelSize, letterSpacing: variant === "full" ? 4 : 2 },
            ]}
            numberOfLines={3}
          >
            {label.toUpperCase()}
          </Text>
          {variant === "full" ? <BouncingDots /> : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: "center",
    justifyContent: "center",
    gap: 28,
  },
  rootCompact: {
    gap: 0,
    minWidth: 40,
    minHeight: 40,
  },
  rootMedium: {
    gap: 14,
  },
  nodeWrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  ring: {
    position: "absolute",
    alignSelf: "center",
  },
  core: {
    backgroundColor: INDIGO,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: "rgba(255,255,255,0.22)",
    overflow: "hidden",
    shadowColor: INDIGO,
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.45,
    shadowRadius: 24,
    elevation: 12,
  },
  copyBlock: {
    alignItems: "center",
    gap: 10,
    maxWidth: 320,
    paddingHorizontal: 8,
  },
  label: {
    fontWeight: "900",
    color: Theme.textPrimaryDark,
    textAlign: "center",
  },
  dotsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    opacity: 0.85,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: INDIGO,
  },
});
