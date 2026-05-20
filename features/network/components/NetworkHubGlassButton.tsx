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
  size = "default",
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
    <LoadingIndicator size={compact ? 12 : 14} color={theme.textColor} />
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
    minWidth: 100,
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
    borderRadius: 14,
    borderWidth: 1,
    overflow: "hidden",
    position: "relative",
    minHeight: 36,
    justifyContent: "center",
  },
  shellCompact: {
    borderRadius: 12,
    minHeight: 30,
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
    left: 12,
    right: 12,
    height: StyleSheet.hairlineWidth,
    backgroundColor: Theme.networkGlassBorder,
    zIndex: 1,
  },
  edgeLineCompact: {
    left: 8,
    right: 8,
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    zIndex: 2,
  },
  contentCompact: {
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  label: {
    fontSize: 9,
    fontWeight: "500",
    letterSpacing: 0.65,
    textTransform: "uppercase",
    lineHeight: 12,
  },
  labelCompact: {
    fontSize: 7,
    letterSpacing: 0.5,
    lineHeight: 10,
  },
  connectedDotOuter: {
    width: 8,
    height: 8,
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(16, 185, 129, 0.22)",
    borderWidth: 1,
    borderColor: "rgba(16, 185, 129, 0.35)",
  },
  connectedDotInner: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: Theme.positive,
  },
});
