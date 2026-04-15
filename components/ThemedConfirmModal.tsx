import Theme from "@/constants/Theme";
import Layout from "@/constants/Layout";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import React from "react";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";

export interface ThemedConfirmModalProps {
  visible: boolean;
  title: string;
  message: string;
  cancelText?: string;
  confirmText?: string;
  onCancel: () => void;
  onConfirm: () => void;
  confirmVariant?: "primary" | "destructive";
}

export function ThemedConfirmModal({
  visible,
  title,
  message,
  cancelText = "Cancel",
  confirmText = "Confirm",
  onCancel,
  onConfirm,
  confirmVariant = "primary",
}: ThemedConfirmModalProps) {
  const insets = useSafeAreaInsets();

  const variantConfig = React.useMemo(() => {
    if (confirmVariant === "destructive") {
      return {
        accentColor: Theme.negative,
        iconName: "exclamation-circle" as const,
        iconColor: Theme.negative,
        iconBg: Theme.negativeMuted,
        btnStyle: styles.confirmButtonDestructive,
      };
    }
    return {
      accentColor: Theme.primary,
      iconName: "question-circle" as const,
      iconColor: Theme.primary,
      iconBg: Theme.aggregatePillBg,
      btnStyle: styles.confirmButtonPrimary,
    };
  }, [confirmVariant]);

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      statusBarTranslucent
      onRequestClose={onCancel}
    >
      <View style={[styles.backdrop, { paddingBottom: insets.bottom }]}>
        <View style={styles.modalContent}>
          <View style={styles.header}>
            <View style={[styles.iconWrap, { backgroundColor: variantConfig.iconBg }]}>
              <FontAwesome name={variantConfig.iconName} size={28} color={variantConfig.iconColor} />
            </View>
          </View>
          <Text style={[styles.title, { color: Theme.textPrimaryDark }]}>{title}</Text>
          <Text style={[styles.message, { color: Theme.textMuted }]}>{message}</Text>
          
          <View style={styles.actions}>
            <TouchableOpacity style={styles.cancelButton} onPress={onCancel} activeOpacity={0.8}>
              <Text style={styles.cancelText}>{cancelText}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.confirmButton, variantConfig.btnStyle]} onPress={onConfirm} activeOpacity={0.8}>
              <Text style={styles.confirmText}>{confirmText}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
    padding: Layout.screenPaddingHorizontal,
  },
  modalContent: {
    backgroundColor: Theme.screenBackground,
    borderRadius: 24,
    padding: 24,
    width: "100%",
    maxWidth: 320,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 10,
  },
  header: {
    marginBottom: 16,
  },
  iconWrap: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 8,
    textAlign: "center",
  },
  message: {
    fontSize: 15,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 24,
  },
  actions: {
    flexDirection: "row",
    width: "100%",
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: Theme.surfaceMuted,
    justifyContent: "center",
    alignItems: "center",
  },
  cancelText: {
    color: Theme.textPrimaryDark,
    fontSize: 16,
    fontWeight: "600",
  },
  confirmButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  confirmButtonPrimary: {
    backgroundColor: Theme.primary,
  },
  confirmButtonDestructive: {
    backgroundColor: Theme.negative,
  },
  confirmText: {
    color: Theme.textOnPrimary,
    fontSize: 16,
    fontWeight: "600",
  },
});
