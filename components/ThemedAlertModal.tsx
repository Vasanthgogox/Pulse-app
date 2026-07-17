import Theme from "@/constants/Theme";
import Layout from "@/constants/Layout";
import { platformShadow } from "@/lib/platformShadow";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import React from "react";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";

export type ThemedAlertModalVariant = "neutral" | "warning";

export interface ThemedAlertModalProps {
  visible: boolean;
  title: string;
  message: string;
  okText?: string;
  onOk: () => void;
  onRequestClose?: () => void;
  variant?: ThemedAlertModalVariant;
  okVariant?: "primary" | "secondary";
}

export function ThemedAlertModal({
  visible,
  title,
  message,
  okText = "OK",
  onOk,
  onRequestClose,
  variant = "neutral",
  okVariant = "secondary",
}: ThemedAlertModalProps) {
  const insets = useSafeAreaInsets();

  const variantConfig = React.useMemo(() => {
    type IconName = React.ComponentProps<typeof FontAwesome>["name"];
    if (variant === "warning") {
      return {
        accentColor: Theme.negative,
        iconName: "exclamation-circle" as IconName,
        iconColor: Theme.negative,
        iconBg: Theme.negativeMuted,
      };
    }
    return {
      accentColor: Theme.modalNeutralAccent,
      iconName: "check-circle" as IconName,
      iconColor: Theme.modalNeutralAccent,
      iconBg: Theme.modalNeutralIconWash,
    };
  }, [variant]);

  const okButtonStyle =
    okVariant === "primary" ? styles.okButtonPrimary : styles.okButtonSecondary;
  const okTextStyle =
    okVariant === "primary" ? styles.okTextPrimary : styles.okTextSecondary;

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      statusBarTranslucent
      onRequestClose={onRequestClose ?? onOk}
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
            <FontAwesome name={variantConfig.iconName} size={22} color={variantConfig.iconColor} />
          </View>

          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>

          <TouchableOpacity
            onPress={onOk}
            style={[styles.okButtonBase, okButtonStyle]}
            activeOpacity={0.85}
            accessibilityRole="button"
          >
            <Text style={[styles.okTextBase, okTextStyle]}>{okText}</Text>
          </TouchableOpacity>
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
    paddingTop: 14,
    paddingBottom: 14,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    alignItems: "center",
    ...platformShadow("0 14px 20px rgba(15, 23, 42, 0.12)", {
      color: Theme.shadow,
      opacity: 0.12,
      radius: 20,
      offsetY: 14,
      elevation: 14,
    }),
  },
  accentBar: {
    width: "100%",
    height: 6,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    marginBottom: 12,
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    marginBottom: 6,
    textAlign: "center",
  },
  message: {
    fontSize: 14,
    color: Theme.textSecondary,
    marginBottom: 14,
    textAlign: "center",
  },
  okButtonBase: {
    borderRadius: 999,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  okButtonPrimary: {
    backgroundColor: Theme.modalNeutralAccent,
  },
  okButtonSecondary: {
    backgroundColor: Theme.surfaceGray,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  okTextBase: {
    fontSize: 16,
    fontWeight: "600",
  },
  okTextPrimary: {
    color: Theme.textOnPrimary,
  },
  okTextSecondary: {
    color: Theme.textPrimaryDark,
  },
});

