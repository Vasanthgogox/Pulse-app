import Theme from "@/constants/Theme";
import Layout from "@/constants/Layout";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import React from "react";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";

export type ThemedConfirmModalVariant = "neutral" | "warning";

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

  const variantConfig = React.useMemo(() => {
    if (variant === "warning") {
      return {
        accentColor: Theme.negative,
        iconName: "exclamation",
        iconInnerBg: Theme.negative,
        iconBg: Theme.negativeMuted || "rgba(239, 68, 68, 0.12)",
      };
    }
    return {
      accentColor: Theme.primary,
      iconName: "question",
      iconInnerBg: Theme.primary,
      iconBg: "rgba(26, 35, 126, 0.08)",
    };
  }, [variant]);

  const confirmButtonStyle =
    confirmVariant === "destructive"
      ? styles.buttonDestructive
      : confirmVariant === "secondary"
      ? styles.buttonSecondary
      : styles.buttonPrimary;
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
              <FontAwesome name={variantConfig.iconName as any} size={20} color="#FFFFFF" />
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
              style={[styles.buttonBase, confirmButtonStyle]}
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
    maxWidth: 360,
    backgroundColor: Theme.screenBackground,
    borderRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 24,
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
    width: "70%",
    height: 4,
    borderRadius: 2,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
    marginBottom: 16,
  },
  iconInnerCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
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
    fontSize: 14,
    fontWeight: "500",
    color: Theme.textSecondary,
    marginBottom: 24,
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
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  buttonPrimary: {
    backgroundColor: Theme.primary,
  },
  buttonSecondary: {
    backgroundColor: Theme.surfaceGray,
    borderWidth: 0,
  },
  buttonDestructive: {
    backgroundColor: Theme.negative,
  },
  textBase: {
    fontSize: 16,
    fontWeight: "600",
  },
  textPrimary: {
    color: Theme.textOnPrimary,
  },
  textSecondary: {
    color: Theme.textPrimaryDark,
  },
});
