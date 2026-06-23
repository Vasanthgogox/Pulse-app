/**
 * Global illustration pill button — pastel blue fill + ink outline (+ Add Load family).
 * Import styles for inline Pressables or use `PulsePillButton` component.
 */
import Theme from "@/constants/Theme";
import { Platform, StyleSheet, type TextStyle, type ViewStyle } from "react-native";

export const PULSE_PILL_BUTTON_RADIUS = 999;
export const PULSE_PILL_BUTTON_BORDER_WIDTH = 2;

/** Base container — merge with size preset + local overrides. */
export const pulsePillButtonContainer: ViewStyle = {
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
  borderRadius: PULSE_PILL_BUTTON_RADIUS,
  borderWidth: PULSE_PILL_BUTTON_BORDER_WIDTH,
  borderColor: Theme.buttonPrimaryBorder,
  backgroundColor: Theme.buttonPrimary,
};

export const pulsePillButtonContainerCompact: ViewStyle = {
  ...pulsePillButtonContainer,
  gap: 5,
  minHeight: 32,
  paddingVertical: 6,
  paddingHorizontal: 12,
};

export const pulsePillButtonContainerDefault: ViewStyle = {
  ...pulsePillButtonContainer,
  gap: 7,
  minHeight: 36,
  paddingVertical: 8,
  paddingHorizontal: 16,
};

export const pulsePillButtonContainerLarge: ViewStyle = {
  ...pulsePillButtonContainer,
  gap: 8,
  minHeight: 44,
  paddingVertical: 12,
  paddingHorizontal: 20,
};

export const pulsePillButtonContainerFullWidth: ViewStyle = {
  alignSelf: "stretch",
  width: "100%",
};

export const pulsePillButtonContainerIconOnly: ViewStyle = {
  ...pulsePillButtonContainer,
  width: 44,
  height: 44,
  minHeight: 44,
  paddingHorizontal: 0,
  paddingVertical: 0,
};

export const pulsePillButtonLabelBase: TextStyle = {
  fontWeight: "700",
  color: Theme.buttonPrimaryText,
  textAlign: "center",
};

export const pulsePillButtonLabelCompact: TextStyle = {
  ...pulsePillButtonLabelBase,
  fontSize: 11,
  letterSpacing: -0.1,
};

export const pulsePillButtonLabelDefault: TextStyle = {
  ...pulsePillButtonLabelBase,
  fontSize: 10,
  letterSpacing: 0.2,
};

export const pulsePillButtonLabelLarge: TextStyle = {
  ...pulsePillButtonLabelBase,
  fontSize: 13,
  letterSpacing: 0.3,
};

export const pulsePillButtonPressed: ViewStyle = {
  backgroundColor: Theme.buttonPrimaryPressed,
};

export const pulsePillButtonDisabled: ViewStyle = {
  opacity: 0.5,
};

/** StyleSheet mirror for screens that prefer StyleSheet.create. */
export const pulsePillButtonStyles = StyleSheet.create({
  container: pulsePillButtonContainerDefault,
  containerCompact: pulsePillButtonContainerCompact,
  containerLarge: pulsePillButtonContainerLarge,
  containerFullWidth: pulsePillButtonContainerFullWidth,
  containerIconOnly: pulsePillButtonContainerIconOnly,
  label: pulsePillButtonLabelDefault,
  labelCompact: pulsePillButtonLabelCompact,
  labelLarge: pulsePillButtonLabelLarge,
  pressed: pulsePillButtonPressed,
  disabled: pulsePillButtonDisabled,
});

export type PulsePillButtonSize = "compact" | "default" | "large" | "icon";

export function pulsePillButtonSizeStyles(size: PulsePillButtonSize = "default"): {
  container: ViewStyle;
  label: TextStyle;
} {
  switch (size) {
    case "compact":
      return {
        container: pulsePillButtonContainerCompact,
        label: pulsePillButtonLabelCompact,
      };
    case "large":
      return {
        container: pulsePillButtonContainerLarge,
        label: pulsePillButtonLabelLarge,
      };
    case "icon":
      return {
        container: pulsePillButtonContainerIconOnly,
        label: pulsePillButtonLabelDefault,
      };
    default:
      return {
        container: pulsePillButtonContainerDefault,
        label: pulsePillButtonLabelDefault,
      };
  }
}

/** Upgrade legacy primary button style objects to illustration pill chrome. */
export function asPulsePillButtonStyle(style: ViewStyle): ViewStyle {
  return {
    ...pulsePillButtonContainerDefault,
    ...style,
    borderRadius: PULSE_PILL_BUTTON_RADIUS,
    borderWidth: PULSE_PILL_BUTTON_BORDER_WIDTH,
    borderColor: Theme.buttonPrimaryBorder,
    backgroundColor: style.backgroundColor ?? Theme.buttonPrimary,
    ...Platform.select({
      web: { cursor: style.opacity === 0.5 ? "not-allowed" : "pointer" },
      default: {},
    }),
  };
}
