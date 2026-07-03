/**
 * Direct message CTA in the network profile modal.
 */
import { FinanceTxnTypography } from "@/constants/FinanceTxnTypography";
import Theme from "@/constants/Theme";
import { Mail } from "lucide-react-native";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";

export type NetworkProfileDirectMessageButtonProps = {
  onPress: () => void;
  /** Taller touch target on narrow viewports (profile modal mobile layout). */
  compact?: boolean;
  disabled?: boolean;
  /** Shown under the button when disabled, e.g. why messaging isn't available yet. */
  helperText?: string | null;
  label?: string;
};

export function NetworkProfileDirectMessageButton({
  onPress,
  compact = false,
  disabled = false,
  helperText = null,
  label = "Message",
}: NetworkProfileDirectMessageButtonProps) {
  return (
    <View style={styles.wrap}>
      <Pressable
        style={({ pressed }) => [
          styles.button,
          compact && styles.buttonCompact,
          disabled && styles.buttonDisabled,
          pressed && !disabled && { opacity: 0.88 },
        ]}
        onPress={onPress}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={disabled && helperText ? helperText : undefined}
      >
        <Mail size={14} color={Theme.textOnPrimary} strokeWidth={2.2} />
        <Text style={[styles.label, compact && styles.labelCompact]}>{label}</Text>
      </Pressable>
      {disabled && helperText ? (
        <Text style={styles.helperText}>{helperText}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: "100%",
    alignSelf: "stretch",
  },
  helperText: {
    marginTop: 6,
    fontSize: 11,
    color: Theme.textSecondary,
    textAlign: "center",
  },
  button: {
    width: "100%",
    alignSelf: "stretch",
    minHeight: 36,
    borderRadius: 10,
    backgroundColor: Theme.textPrimaryDark,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    ...Platform.select({
      ios: {
        shadowColor: "#0F172A",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.12,
        shadowRadius: 8,
      },
      android: { elevation: 3 },
      web: {
        boxShadow: "0 4px 14px rgba(15, 23, 42, 0.18)",
      },
      default: {},
    }),
  },
  buttonCompact: {
    minHeight: 48,
    borderRadius: 12,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  label: {
    ...FinanceTxnTypography.buttonLabel,
    color: Theme.buttonDarkText,
    zIndex: 1,
  },
  labelCompact: {
    fontWeight: "600",
    letterSpacing: 0,
    textTransform: "none",
  },
});
