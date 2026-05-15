/**
 * Thin global status strip — dark bar + pulse + brand tag (dispatcher + driver shells).
 */
import Theme from "@/constants/Theme";
import { MotiView } from "moti";
import {
  Platform,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export type ShellFooterStripVariant = "embedded" | "desktopFixed";

export interface ShellFooterStripProps {
  variant?: ShellFooterStripVariant;
  /** Negative horizontal margin so the strip spans edge-to-edge inside a padded footer. */
  bleedHorizontal?: number;
}

export function ShellFooterStrip({
  variant = "embedded",
  bleedHorizontal = 0,
}: ShellFooterStripProps) {
  const insets = useSafeAreaInsets();
  const safeBottom =
    variant === "desktopFixed" ? Math.max(Math.round(insets.bottom * 0.65), 8) : 0;

  return (
    <View
      style={[
        styles.bar,
        variant === "embedded" && styles.barEmbedded,
        bleedHorizontal > 0 && { marginHorizontal: -bleedHorizontal },
        variant === "desktopFixed" && styles.desktopFixed,
        variant === "desktopFixed" && { paddingBottom: safeBottom },
      ]}
      accessibilityRole="summary"
      accessibilityLabel="Alright registered. Copyright 2026."
    >
      <MotiView
        style={styles.pulseDot}
        from={{ opacity: 0.35, scale: 0.88 }}
        animate={{ opacity: 1, scale: 1.08 }}
        transition={{
          type: "timing",
          duration: 850,
          loop: true,
          repeatReverse: true,
        }}
      />
      <Text style={styles.alright}>Alright</Text>
      <View style={styles.registeredPill}>
        <Text style={styles.registeredText}>REGISTERED</Text>
      </View>
      <Text style={styles.year}>© 2026</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    flexWrap: "wrap",
    gap: 8,
    paddingVertical: 5,
    paddingHorizontal: 12,
    backgroundColor: "#020617",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(148,163,184,0.22)",
  },
  barEmbedded: {
    marginTop: 6,
  },
  desktopFixed: Platform.select<ViewStyle>({
    web: {
      position: "fixed",
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 95,
    } as ViewStyle,
    default: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 95,
    },
  }),
  pulseDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: Theme.darkGreen,
  },
  alright: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.35,
    color: "rgba(248,250,252,0.96)",
  },
  registeredPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.35)",
    backgroundColor: "rgba(15,23,42,0.65)",
  },
  registeredText: {
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 1,
    color: "rgba(226,232,240,0.92)",
  },
  year: {
    fontSize: 9,
    fontWeight: "600",
    letterSpacing: 0.6,
    color: "rgba(148,163,184,0.95)",
  },
});
