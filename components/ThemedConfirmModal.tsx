import Theme from "@/constants/Theme";
import Layout from "@/constants/Layout";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import React from "react";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";

export type ThemedConfirmModalVariant = "neutral" | "warning" | "positive";

export interface ThemedConfirmModalProps {
  visible: boolean;
  title: string;
  message: string;
  cancelText?: string;
  confirmText?: string;
  onCancel: () => void;
  onConfirm: () => void;
  onRequestClose?: () => void;
  variant?: ThemedConfirmModalVariant;
  confirmVariant?: "primary" | "secondary" | "destructive";
}

type VariantConfig = {
  accentColor: string;
  iconName: string;
  iconInnerBg: string;
  iconBg: string;
  /** Filled primary / proceed button (driver app: emerald) */
  confirmButtonBg: string;
  /** Icon glyph in inner circle (use full white for green on light) */
  iconColor: string;
};

export function ThemedConfirmModal({
  visible,
  title,
  message,
  cancelText = "Cancel",
  confirmText = "Confirm",
  onCancel,
  onConfirm,
  onRequestClose,
  variant = "neutral",
  confirmVariant = "primary",
}: ThemedConfirmModalProps) {
  const insets = useSafeAreaInsets();

  const variantConfig = React.useMemo((): VariantConfig => {
    if (variant === "warning") {
      return {
        accentColor: Theme.negative,
        iconName: "exclamation",
        iconInnerBg: Theme.negative,
        iconBg: Theme.negativeMuted || "rgba(239, 68, 68, 0.12)",
        confirmButtonBg: Theme.buttonMatteBlack,
        iconColor: "#FFFFFF",
      };
    }
    if (variant === "positive") {
      return {
        accentColor: Theme.driverEmerald,
        iconName: "check",
        iconInnerBg: Theme.driverEmerald,
        iconBg: Theme.driverEmeraldMuted,
        confirmButtonBg: Theme.driverEmerald,
        iconColor: "#FFFFFF",
      };
    }
    return {
      accentColor: Theme.modalNeutralAccent,
      iconName: "question",
      iconInnerBg: Theme.modalNeutralAccent,
      iconBg: Theme.modalNeutralIconWash,
      confirmButtonBg: Theme.buttonMatteBlack,
      iconColor: "#FFFFFF",
    };
  }, [variant]);

  const confirmTextStyle =
    confirmVariant === "secondary" ? styles.textSecondary : styles.textPrimary;

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      statusBarTranslucent
      onRequestClose={onRequestClose ?? onCancel}
    >
      <View
        style={[
          styles.overlay,
          {
            paddingTop: insets.top,
            paddingBottom: insets.bottom,
          },
        ]}
      >
        <View style={styles.card}>
          <View style={[styles.accentBar, { backgroundColor: variantConfig.accentColor }]} />

          <View style={[styles.iconCircle, { backgroundColor: variantConfig.iconBg }]}>
            <View style={[styles.iconInnerCircle, { backgroundColor: variantConfig.iconInnerBg }]}>
              <FontAwesome
                name={variantConfig.iconName as keyof typeof FontAwesome.glyphMap}
                size={20}
                color={variantConfig.iconColor}
              />
            </View>
          </View>

          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>

          <View style={styles.buttonRow}>
            <TouchableOpacity
              onPress={onCancel}
              style={[styles.buttonBase, styles.buttonSecondary]}
              activeOpacity={0.85}
              accessibilityRole="button"
            >
              <Text style={[styles.textBase, styles.textSecondary]}>{cancelText}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={onConfirm}
              style={[
                styles.buttonBase,
                confirmVariant === "destructive" && styles.buttonDestructive,
                confirmVariant === "secondary" && styles.buttonSecondary,
                confirmVariant === "primary" && { backgroundColor: variantConfig.confirmButtonBg },
              ]}
              activeOpacity={0.85}
              accessibilityRole="button"
            >
              <Text style={[styles.textBase, confirmTextStyle]}>{confirmText}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: Theme.overlayBackdrop,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Layout.screenPaddingHorizontal,
  },
  card: {
    width: "100%",
    maxWidth: 460,
    backgroundColor: Theme.cardWhite,
    borderRadius: 20,
    paddingHorizontal: 22,
    paddingTop: 26,
    paddingBottom: 20,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    alignItems: "center",
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 14,
  },
  accentBar: {
    position: "absolute",
    top: 16,
    width: "64%",
    height: 4,
    borderRadius: 2,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
    marginBottom: 14,
  },
  iconInnerCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    marginBottom: 8,
    textAlign: "center",
  },
  message: {
    fontSize: 13,
    fontWeight: "600",
    color: Theme.textSecondary,
    marginBottom: 20,
    textAlign: "center",
    lineHeight: 20,
  },
  buttonRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    width: "100%",
  },
  buttonBase: {
    flex: 1,
    borderRadius: 999,
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  buttonSecondary: {
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  buttonDestructive: {
    backgroundColor: Theme.negative,
  },
  textBase: {
    fontSize: 15,
    fontWeight: "800",
  },
  textPrimary: {
    color: Theme.buttonMatteBlackText,
  },
  textSecondary: {
    color: Theme.textPrimaryDark,
  },
});
