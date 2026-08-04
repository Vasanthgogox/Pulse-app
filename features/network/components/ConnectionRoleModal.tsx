/**
 * Client / supplier selection when sending a network connection request.
 */
import { PulseLoader } from "@/components/PulseLoader";
import Theme from "@/constants/Theme";
import { useLanguage } from "@/contexts/LanguageContext";
import { Check } from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

export type ConnectionInviteRole = "client" | "supplier";

export type ConnectionRoleModalProps = {
  visible: boolean;
  companyName: string;
  submitting?: boolean;
  /**
   * Roles this org may offer. Asset-only orgs connect as "client" only
   * (they never onboard suppliers). Defaults to both.
   */
  allowedRoles?: ConnectionInviteRole[];
  onClose: () => void;
  onConfirm: (role: ConnectionInviteRole) => void;
};

export function ConnectionRoleModal({
  visible,
  companyName,
  submitting = false,
  allowedRoles = ["client", "supplier"],
  onClose,
  onConfirm,
}: ConnectionRoleModalProps) {
  const { t } = useLanguage();
  const canClient = allowedRoles.includes("client");
  const canSupplier = allowedRoles.includes("supplier");
  const singleRole = allowedRoles.length === 1 ? allowedRoles[0] : null;
  const [selectedRole, setSelectedRole] = useState<ConnectionInviteRole | null>(
    singleRole,
  );

  useEffect(() => {
    // When only one role is allowed, keep it preselected so the CTA is live.
    if (!visible) setSelectedRole(singleRole);
  }, [visible, singleRole]);

  const handleSubmit = useCallback(() => {
    if (!selectedRole || submitting) return;
    onConfirm(selectedRole);
  }, [onConfirm, selectedRole, submitting]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={submitting ? undefined : onClose}
    >
      <View style={styles.backdrop}>
        <Pressable
          style={styles.backdropTouch}
          onPress={onClose}
          disabled={submitting}
          accessibilityLabel={t("cancel")}
        />
        <View style={styles.card}>
          {submitting ? (
            <View style={styles.loadingPane}>
              <PulseLoader
                variant="medium"
                label={t("networkConnectionTransmitting")}
              />
            </View>
          ) : (
            <>
              <View style={styles.header}>
                <Text style={styles.kicker}>{t("networkConnectionTypeKicker")}</Text>
                <Text style={styles.title} numberOfLines={2}>
                  {`${t("networkConnectionInviteVerb")} ${companyName}`}
                </Text>
                <Text style={styles.subtitle}>{t("networkConnectionTypeSubtitle")}</Text>
              </View>

              <View style={styles.options}>
                {canClient ? (
                  <RoleOption
                    title={t("networkConnectionAddAsClient")}
                    description={t("networkConnectionAddAsClientDesc")}
                    selected={selectedRole === "client"}
                    onPress={() => setSelectedRole("client")}
                  />
                ) : null}
                {canSupplier ? (
                  <RoleOption
                    title={t("networkConnectionAddAsSupplier")}
                    description={t("networkConnectionAddAsSupplierDesc")}
                    selected={selectedRole === "supplier"}
                    onPress={() => setSelectedRole("supplier")}
                  />
                ) : null}
              </View>

              <View style={styles.footer}>
                <Pressable
                  onPress={handleSubmit}
                  disabled={!selectedRole}
                  style={({ pressed }) => [
                    styles.submitBtn,
                    !selectedRole && styles.submitBtnDisabled,
                    pressed && selectedRole && { opacity: 0.92 },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={t("networkConnectionSendRequest")}
                >
                  <Text
                    style={[
                      styles.submitBtnText,
                      !selectedRole && styles.submitBtnTextDisabled,
                    ]}
                  >
                    {t("networkConnectionSendRequest")}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={onClose}
                  style={({ pressed }) => [styles.cancelBtn, pressed && { opacity: 0.7 }]}
                  accessibilityRole="button"
                >
                  <Text style={styles.cancelBtnText}>{t("cancel")}</Text>
                </Pressable>
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

function RoleOption({
  title,
  description,
  selected,
  onPress,
}: {
  title: string;
  description: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.option,
        selected && styles.optionSelected,
        pressed && { opacity: 0.95 },
      ]}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
    >
      <View style={styles.optionCopy}>
        <Text style={styles.optionTitle}>{title}</Text>
        <Text style={styles.optionDesc}>{description}</Text>
      </View>
      <View style={[styles.radio, selected && styles.radioSelected]}>
        {selected ? <Check size={12} color={Theme.buttonPrimaryText} strokeWidth={4} /> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.4)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
    paddingVertical: 24,
  },
  backdropTouch: {
    ...StyleSheet.absoluteFillObject,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: Theme.networkCardBackground,
    borderRadius: 32,
    borderWidth: 1,
    borderColor: Theme.networkCardBorder,
    overflow: "hidden",
    shadowColor: Theme.textPrimaryDark,
    shadowOpacity: 0.14,
    shadowRadius: 40,
    shadowOffset: { width: 0, height: 24 },
    elevation: 12,
  },
  loadingPane: {
    paddingVertical: 48,
    paddingHorizontal: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  header: {
    paddingHorizontal: 28,
    paddingTop: 28,
    paddingBottom: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
    alignItems: "center",
  },
  kicker: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textMuted,
    letterSpacing: 3.2,
    textTransform: "uppercase",
    marginBottom: 10,
  },
  title: {
    fontSize: 22,
    fontWeight: "900",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
    letterSpacing: -0.5,
    textAlign: "center",
  },
  subtitle: {
    marginTop: 10,
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textMuted,
    textAlign: "center",
    lineHeight: 18,
    paddingHorizontal: 8,
  },
  options: {
    paddingHorizontal: 24,
    paddingVertical: 20,
    gap: 12,
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surfaceGray,
    gap: 12,
  },
  optionSelected: {
    borderColor: Theme.primary,
    backgroundColor: Theme.primary + "12",
    shadowColor: Theme.primary,
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  optionCopy: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  optionTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
    letterSpacing: 0.2,
  },
  optionDesc: {
    fontSize: 11,
    fontWeight: "500",
    color: Theme.textMuted,
    lineHeight: 16,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: Theme.borderMedium,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  radioSelected: {
    borderColor: Theme.primary,
    backgroundColor: Theme.buttonPrimary,
  },
  footer: {
    paddingHorizontal: 24,
    paddingVertical: 20,
    gap: 8,
    backgroundColor: Theme.surfaceGray,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderLight,
  },
  submitBtn: {
    paddingVertical: 16,
    borderRadius: 14,
    backgroundColor: Theme.textPrimaryDark,
    alignItems: "center",
    justifyContent: "center",
  },
  submitBtnDisabled: {
    backgroundColor: Theme.borderLight,
  },
  submitBtnText: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.buttonDarkText,
    letterSpacing: 1.6,
    textTransform: "uppercase",
  },
  submitBtnTextDisabled: {
    color: Theme.textMuted,
  },
  cancelBtn: {
    paddingVertical: 14,
    alignItems: "center",
  },
  cancelBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textMuted,
  },
});
