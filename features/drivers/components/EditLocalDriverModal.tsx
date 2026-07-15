/**
 * Edit name / email / phone for local (unlinked) fleet directory drivers.
 */
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { formatMobileNumber } from "@/lib/format";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useEffect, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { DriverRow, UpdateDriverData } from "../services/drivers.service";
import {
  findLocalDriverContactCollisions,
  isLocalDriverRow,
} from "../services/drivers.service";

export interface EditLocalDriverModalProps {
  visible: boolean;
  driver: DriverRow | null;
  organizationId: string;
  onClose: () => void;
  /** Caller invokes updateDriver; may throw / return Promise rejection. */
  onSave: (patch: UpdateDriverData) => Promise<void> | void;
}

export function EditLocalDriverModal({
  visible,
  driver,
  organizationId,
  onClose,
  onSave,
}: EditLocalDriverModalProps) {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (driver) {
      setName((driver.name ?? "").trim());
      setPhone((driver.phone ?? "").trim());
      setEmail((driver.email ?? "").trim());
      setError(null);
    }
  }, [driver]);

  if (!visible || !driver) return null;

  if (!isLocalDriverRow(driver)) {
    return (
      <Modal
        visible={visible}
        animationType="slide"
        onRequestClose={onClose}
        presentationStyle="fullScreen"
      >
        <View style={[styles.screenRoot, { paddingTop: insets.top + 16 }]}>
          <View style={styles.screenHeader}>
            <TouchableOpacity
              style={styles.screenHeaderButton}
              onPress={onClose}
              accessibilityLabel="Go back"
              activeOpacity={0.8}
            >
              <FontAwesome
                name="chevron-left"
                size={16}
                color={Theme.textPrimaryDark}
              />
            </TouchableOpacity>
            <Text style={styles.screenTitle}>Driver identity</Text>
          </View>
          <View style={styles.readonlyBody}>
            <Text style={styles.readonlyTitle}>Managed by driver app</Text>
            <Text style={styles.readonlyText}>
              This driver is connected (or has left the fleet). Name, email, and
              phone come from their app profile and cannot be edited here.
            </Text>
            <TouchableOpacity
              style={styles.screenSubmitButton}
              onPress={onClose}
              activeOpacity={0.9}
            >
              <Text style={styles.screenSubmitButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  }

  const canSubmit = name.trim().length > 0 && !submitting;

  const persist = async () => {
    setSubmitting(true);
    setError(null);
    const patch: UpdateDriverData = {
      name: name.trim(),
      phone: phone.trim() || null,
      email: email.trim() || null,
    };
    try {
      const result = onSave(patch);
      if (result && typeof (result as Promise<void>).then === "function") {
        await result;
      }
      setSubmitting(false);
      onClose();
    } catch (err: unknown) {
      setSubmitting(false);
      setError(err instanceof Error ? err.message : "Failed to update driver");
    }
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const { error: collideError, collisions } =
        await findLocalDriverContactCollisions(organizationId, driver.id, {
          phone: phone.trim() || null,
          email: email.trim() || null,
        });
      if (collideError) {
        setSubmitting(false);
        setError(collideError.message);
        return;
      }
      if (collisions.length > 0) {
        setSubmitting(false);
        const hardBlock = collisions.find((c) => c.kind === "org_roster_phone");
        if (hardBlock) {
          Alert.alert("Phone already in use", hardBlock.detail);
          return;
        }
        const message = collisions.map((c) => c.detail).join("\n\n");
        Alert.alert(
          "Contact may link an app account",
          message,
          [
            { text: "Cancel", style: "cancel" },
            {
              text: "Save anyway",
              style: "destructive",
              onPress: () => {
                void persist();
              },
            },
          ],
        );
        return;
      }
      await persist();
    } catch (err: unknown) {
      setSubmitting(false);
      setError(err instanceof Error ? err.message : "Failed to update driver");
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="fullScreen"
    >
      <KeyboardAvoidingView
        style={styles.screenRoot}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={[styles.screenRoot, { backgroundColor: Theme.surface }]}>
          <View style={[styles.screenHeader, { paddingTop: insets.top + 16 }]}>
            <TouchableOpacity
              style={styles.screenHeaderButton}
              onPress={onClose}
              accessibilityLabel="Go back"
              activeOpacity={0.8}
            >
              <FontAwesome
                name="chevron-left"
                size={16}
                color={Theme.textPrimaryDark}
              />
            </TouchableOpacity>
            <View style={styles.screenHeaderTitleWrap}>
              <Text style={styles.screenTitle}>Edit driver</Text>
            </View>
          </View>

          <ScrollView
            style={styles.screenScroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[
              styles.screenScrollContent,
              { paddingBottom: insets.bottom + 140 },
            ]}
          >
            <View style={styles.screenSection}>
              <Text style={styles.screenSectionLabel}>CONTACT DETAILS</Text>
              <Text style={styles.hintText}>
                Local directory only. Matching phone or email can attach a driver
                app account later — edit carefully.
              </Text>

              <Pressable style={styles.screenInputCard}>
                <Text style={styles.screenInputLabel}>
                  Name <Text style={styles.screenRequiredMark}>*</Text>
                </Text>
                <TextInput
                  style={styles.screenInput}
                  placeholder="Driver name"
                  placeholderTextColor={Theme.textMutedDemo}
                  value={name}
                  onChangeText={setName}
                  autoCapitalize="words"
                />
              </Pressable>

              <Pressable style={styles.screenInputCard}>
                <Text style={styles.screenInputLabel}>Phone</Text>
                <TextInput
                  style={styles.screenInput}
                  placeholder="+91 98765 43210"
                  placeholderTextColor={Theme.textMutedDemo}
                  value={phone}
                  onChangeText={(t) => setPhone(formatMobileNumber(t))}
                  keyboardType="phone-pad"
                />
              </Pressable>

              <Pressable style={styles.screenInputCard}>
                <Text style={styles.screenInputLabel}>Email</Text>
                <TextInput
                  style={styles.screenInput}
                  placeholder="driver@example.com"
                  placeholderTextColor={Theme.textMutedDemo}
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </Pressable>

              {error ? (
                <View style={styles.screenErrorCard}>
                  <Text style={styles.screenErrorText}>{error}</Text>
                </View>
              ) : null}
            </View>
          </ScrollView>

          <View
            style={[styles.screenFooter, { paddingBottom: insets.bottom + 12 }]}
          >
            <TouchableOpacity
              style={[
                styles.screenSubmitButton,
                (!canSubmit || submitting) && styles.screenButtonDisabled,
              ]}
              onPress={() => {
                void handleSubmit();
              }}
              disabled={!canSubmit || submitting}
              activeOpacity={0.9}
            >
              <Text style={styles.screenSubmitButtonText}>
                {submitting ? "Saving..." : "SAVE CHANGES"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screenRoot: {
    flex: 1,
  },
  screenHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
    backgroundColor: Theme.screenBackground,
  },
  screenHeaderButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Theme.surface,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  screenHeaderTitleWrap: {
    flex: 1,
    minWidth: 0,
  },
  screenTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.3,
  },
  screenScroll: {
    flex: 1,
  },
  screenScrollContent: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 20,
    gap: 24,
  },
  screenSection: {
    gap: 14,
  },
  screenSectionLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textMuted,
    letterSpacing: 1.2,
  },
  hintText: {
    fontSize: 13,
    lineHeight: 18,
    color: Theme.textSecondary,
  },
  screenInputCard: {
    backgroundColor: Theme.screenBackground,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 6,
  },
  screenInputLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textSecondary,
  },
  screenRequiredMark: {
    color: Theme.negative,
  },
  screenInput: {
    fontSize: 16,
    color: Theme.textPrimaryDark,
    padding: 0,
    minHeight: 24,
  },
  screenErrorCard: {
    backgroundColor: Theme.negativeMuted,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: Theme.negative + "30",
  },
  screenErrorText: {
    color: Theme.negative,
    fontSize: 13,
  },
  screenFooter: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Theme.borderLight,
    backgroundColor: Theme.surface,
  },
  screenSubmitButton: {
    backgroundColor: Theme.primary,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
  },
  screenSubmitButtonText: {
    color: Theme.textOnPrimary,
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: 0.4,
  },
  screenButtonDisabled: {
    opacity: 0.5,
  },
  readonlyBody: {
    padding: Layout.screenPaddingHorizontal,
    gap: 12,
    marginTop: 24,
  },
  readonlyTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  readonlyText: {
    fontSize: 14,
    lineHeight: 20,
    color: Theme.textSecondary,
    marginBottom: 12,
  },
});
