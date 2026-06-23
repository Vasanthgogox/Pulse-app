/**
 * Illustration pill CTA — pastel blue fill, ink outline, optional leading icon.
 * Canonical global primary action button (+ Add Load family).
 */
import {
  pulsePillButtonContainerFullWidth,
  pulsePillButtonDisabled,
  pulsePillButtonPressed,
  pulsePillButtonSizeStyles,
  type PulsePillButtonSize,
} from "@/constants/PulsePillButtonChrome";
import Theme from "@/constants/Theme";
import { Plus, type LucideIcon } from "lucide-react-native";
import { memo, type ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";

export interface PulsePillButtonProps {
  label?: string;
  onPress?: () => void;
  disabled?: boolean;
  loading?: boolean;
  size?: PulsePillButtonSize;
  fullWidth?: boolean;
  icon?: ReactNode;
  showPlusIcon?: boolean;
  IconComponent?: LucideIcon;
  iconSize?: number;
  accessibilityLabel?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
  labelStyle?: StyleProp<TextStyle>;
}

export const PulsePillButton = memo(function PulsePillButton({
  label,
  onPress,
  disabled = false,
  loading = false,
  size = "default",
  fullWidth = false,
  icon,
  showPlusIcon = false,
  IconComponent = Plus,
  iconSize,
  accessibilityLabel,
  testID,
  style,
  labelStyle,
}: PulsePillButtonProps) {
  const inactive = disabled || loading || !onPress;
  const sizeStyles = pulsePillButtonSizeStyles(size);
  const resolvedIconSize =
    iconSize ?? (size === "compact" ? 12 : size === "large" ? 15 : 13);
  const resolvedLabel = label ?? accessibilityLabel ?? "Action";

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? resolvedLabel}
      accessibilityState={{ disabled: inactive, busy: loading }}
      style={({ pressed }) => [
        sizeStyles.container,
        fullWidth && pulsePillButtonContainerFullWidth,
        inactive && pulsePillButtonDisabled,
        pressed && !inactive && pulsePillButtonPressed,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={Theme.buttonPrimaryText} size="small" />
      ) : (
        <View
          style={[
            styles.inner,
            size === "compact" ? styles.innerCompact : null,
          ]}
        >
          {icon ??
            (showPlusIcon ? (
              <IconComponent
                size={resolvedIconSize}
                color={Theme.buttonPrimaryText}
                strokeWidth={2.4}
              />
            ) : null)}
          {label ? (
            <Text
              style={[sizeStyles.label, labelStyle]}
              numberOfLines={1}
            >
              {label}
            </Text>
          ) : null}
        </View>
      )}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  inner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  innerCompact: {
    gap: 5,
  },
});
