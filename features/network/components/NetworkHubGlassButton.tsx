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

function ConnectedDot() {
  return (
    <View style={styles.connectedDotOuter}>
      <View style={styles.connectedDotInner} />
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

  return (
    <View
      style={[
        styles.shell,
        compact && styles.shellCompact,
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
      <View style={[styles.edgeLine, compact && styles.edgeLineCompact]} pointerEvents="none" />
      <View style={[styles.content, compact && styles.contentCompact]}>{children}</View>
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

  const inner = loading ? (
    <LoadingIndicator size={compact ? 10 : 12} color={theme.textColor} />
  ) : (
    <>
      {variant === "connected" ? <ConnectedDot /> : leadingIcon}
      <Text
        style={[styles.label, compact && styles.labelCompact, { color: theme.textColor }]}
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
  shell: {
    borderRadius: 10,
    borderWidth: 1,
    overflow: "hidden",
    position: "relative",
    minHeight: 28,
    justifyContent: "center",
  },
  shellCompact: {
    borderRadius: 9,
    minHeight: 24,
  },
  shellPressed: {
    opacity: 0.94,
  },
  specular: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.88,
  },
  edgeLine: {
    position: "absolute",
    top: 0,
    left: 10,
    right: 10,
    height: StyleSheet.hairlineWidth,
    backgroundColor: Theme.networkGlassBorder,
    zIndex: 1,
  },
  edgeLineCompact: {
    left: 7,
    right: 7,
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    zIndex: 2,
  },
  contentCompact: {
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  label: {
    fontSize: 8,
    fontWeight: "500",
    letterSpacing: 0.55,
    textTransform: "uppercase",
    lineHeight: 11,
  },
  labelCompact: {
    fontSize: 7,
    letterSpacing: 0.45,
    lineHeight: 9,
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
  connectedDotInner: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: Theme.positive,
  },
});
