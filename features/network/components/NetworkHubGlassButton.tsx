/**
 * Apple-style frosted glass action button (Connected / Connect / Pending).
 */
import { LoadingIndicator } from "@/components/LoadingIndicator";
import Theme from "@/constants/Theme";
import { LinearGradient } from "expo-linear-gradient";
import type { ReactNode } from "react";
import { Platform, Pressable, StyleSheet, Text, View, type ViewStyle } from "react-native";

const GLASS_WEB: ViewStyle =
  Platform.OS === "web"
    ? ({
        backdropFilter: "blur(14px) saturate(170%)",
        WebkitBackdropFilter: "blur(14px) saturate(170%)",
      } as ViewStyle)
    : {};

const btnShadow = Platform.select({
  ios: {
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
  },
  android: { elevation: 3 },
  web: {
    boxShadow:
      "0 4px 14px rgba(15, 23, 42, 0.08), 0 0 0 0.5px rgba(255, 255, 255, 0.7) inset",
  },
  default: {},
});

export type NetworkHubGlassButtonVariant = "connected" | "primary" | "neutral";

type GlassTheme = {
  gradientTop: string;
  backgroundColor: string;
  borderColor: string;
  textColor: string;
  specular: string;
};

const VARIANT_THEMES: Record<NetworkHubGlassButtonVariant, GlassTheme> = {
  connected: {
    gradientTop: Theme.networkGlassBtnConnectedGradientTop,
    backgroundColor: Theme.networkGlassBtnConnectedBg,
    borderColor: Theme.networkGlassBtnConnectedBorder,
    textColor: Theme.networkGlassBtnConnectedText,
    specular: Theme.networkGlassSpecular,
  },
  primary: {
    gradientTop: Theme.networkGlassBtnPrimaryGradientTop,
    backgroundColor: Theme.networkGlassBtnPrimaryBg,
    borderColor: Theme.networkGlassBtnPrimaryBorder,
    textColor: Theme.primary,
    specular: Theme.networkGlassSpecular,
  },
  neutral: {
    gradientTop: Theme.networkGlassBtnNeutralGradientTop,
    backgroundColor: Theme.networkGlassBtnNeutralBg,
    borderColor: Theme.networkGlassBtnNeutralBorder,
    textColor: Theme.textMuted,
    specular: Theme.networkGlassSpecular,
  },
};

function ConnectedDot({ small = false }: { small?: boolean }) {
  return (
    <View style={[styles.connectedDotOuter, small && styles.connectedDotOuterSmall]}>
      <View style={[styles.connectedDotInner, small && styles.connectedDotInnerSmall]} />
    </View>
  );
}

function GlassButtonShell({
  variant,
  compact,
  pressed,
  children,
}: {
  variant: NetworkHubGlassButtonVariant;
  compact: boolean;
  pressed?: boolean;
  children: ReactNode;
}) {
  const theme = VARIANT_THEMES[variant];
  /** CONNECTED is a status indicator, not a CTA — render it at a tighter
   *  pill scale so it doesn't dominate the card or fight visually with
   *  the INTEGRATED badge floating at the top-right corner. The status
   *  variant uses smaller padding, height, and edge-line inset; the
   *  label + dot styles also shrink (see `*Status` styles below). */
  const isStatus = variant === "connected";

  return (
    <View
      style={[
        styles.shell,
        compact && styles.shellCompact,
        isStatus && styles.shellStatus,
        { borderColor: theme.borderColor },
        btnShadow,
        GLASS_WEB,
        pressed && styles.shellPressed,
      ]}
    >
      <LinearGradient
        colors={[theme.gradientTop, theme.backgroundColor]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={[theme.specular, "rgba(255,255,255,0)"]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 0.65 }}
        style={styles.specular}
        pointerEvents="none"
      />
      <View
        style={[
          styles.edgeLine,
          compact && styles.edgeLineCompact,
          isStatus && styles.edgeLineStatus,
        ]}
        pointerEvents="none"
      />
      <View
        style={[
          styles.content,
          compact && styles.contentCompact,
          isStatus && styles.contentStatus,
        ]}
      >
        {children}
      </View>
    </View>
  );
}

export type NetworkHubGlassButtonProps = {
  variant: NetworkHubGlassButtonVariant;
  label: string;
  size?: "default" | "compact";
  onPress?: () => void;
  disabled?: boolean;
  loading?: boolean;
  leadingIcon?: ReactNode;
  accessibilityLabel?: string;
};

export function NetworkHubGlassButton({
  variant,
  label,
  size = "compact",
  onPress,
  disabled = false,
  loading = false,
  leadingIcon,
  accessibilityLabel,
}: NetworkHubGlassButtonProps) {
  const compact = size === "compact";
  const theme = VARIANT_THEMES[variant];
  const isStatic = variant === "connected" || !onPress;
  /** Status variant (CONNECTED) renders smaller than the CTA variants
   *  so it sits alongside the INTEGRATED badge as a peer indicator. */
  const isStatus = variant === "connected";

  const inner = loading ? (
    <LoadingIndicator size={compact ? 10 : 12} color={theme.textColor} />
  ) : (
    <>
      {isStatus ? <ConnectedDot small /> : leadingIcon}
      <Text
        style={[
          styles.label,
          compact && styles.labelCompact,
          isStatus && styles.labelStatus,
          { color: theme.textColor },
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </>
  );

  if (isStatic) {
    return (
      <View
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? label}
        style={[styles.pressable, compact && styles.pressableCompact]}
      >
        <GlassButtonShell variant={variant} compact={compact}>
          {inner}
        </GlassButtonShell>
      </View>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      style={({ pressed }) => [
        styles.pressable,
        compact && styles.pressableCompact,
        (disabled || loading) && styles.pressableDisabled,
        pressed && !disabled && !loading && styles.pressablePressed,
      ]}
    >
      {({ pressed }) => (
        <GlassButtonShell variant={variant} compact={compact} pressed={pressed}>
          {inner}
        </GlassButtonShell>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressable: {
    minWidth: 72,
    alignSelf: "flex-end",
  },
  pressableCompact: {
    minWidth: 0,
  },
  pressableDisabled: {
    opacity: 0.5,
  },
  pressablePressed: {
    opacity: 0.96,
    transform: [{ scale: 0.985 }],
  },
  /** Pill-shaped frosted CTA matching the discover-card reference
   *  (Connect / Request sent / Connected). Radius is fully rounded so the
   *  button reads as a single confident pill, with extra padding so the
   *  uppercase label + leading icon get enough breathing room to land
   *  cleanly on mobile (Expo) and desktop. */
  shell: {
    borderRadius: 999,
    borderWidth: 1,
    overflow: "hidden",
    position: "relative",
    minHeight: 32,
    justifyContent: "center",
  },
  shellCompact: {
    borderRadius: 999,
    minHeight: 28,
  },
  /** Tighter pill used by the `connected` status variant. Matches the
   *  visual weight of the INTEGRATED badge — both pills now read as
   *  peer status chips rather than CONNECTED dominating the card. */
  shellStatus: {
    minHeight: 20,
    borderRadius: 999,
  },
  shellPressed: {
    opacity: 0.94,
  },
  specular: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.78,
  },
  /** Inner top specular hairline. Pulled tighter on the pill so it hugs
   *  the curved edge instead of bleeding into the rounded corner. */
  edgeLine: {
    position: "absolute",
    top: 0,
    left: 16,
    right: 16,
    height: StyleSheet.hairlineWidth,
    backgroundColor: Theme.networkGlassBorder,
    zIndex: 1,
  },
  edgeLineCompact: {
    left: 12,
    right: 12,
  },
  /** Status pill specular hairline pulled even tighter so it stays
   *  inside the smaller curved edge of the CONNECTED chip. */
  edgeLineStatus: {
    left: 8,
    right: 8,
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 6,
    zIndex: 2,
  },
  contentCompact: {
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  /** Status pill (CONNECTED) — tighter than `contentCompact` so it
   *  visually peers with the INTEGRATED badge instead of looking
   *  like a primary CTA. */
  contentStatus: {
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  label: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.7,
    textTransform: "uppercase",
    lineHeight: 13,
  },
  labelCompact: {
    fontSize: 9,
    letterSpacing: 0.6,
    lineHeight: 12,
  },
  /** Smaller label for the CONNECTED status pill so it lines up
   *  with the INTEGRATED chip's text size (6 / 0.7 / 9). */
  labelStatus: {
    fontSize: 8,
    letterSpacing: 0.6,
    lineHeight: 10,
  },
  connectedDotOuter: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(16, 185, 129, 0.22)",
    borderWidth: 1,
    borderColor: "rgba(16, 185, 129, 0.35)",
  },
  /** Smaller dot variant for the status pill — keeps the dot in
   *  proportion to the reduced pill height (~20 px). */
  connectedDotOuterSmall: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  connectedDotInner: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: Theme.positive,
  },
  connectedDotInnerSmall: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
  },
});
