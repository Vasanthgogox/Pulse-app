/**
 * Create Trip — matches app layout and theme (TreasuryDetailLayout pattern).
 * TeslaHeader (dark) + scroll body + sticky CTA. Layout + Theme only.
 */
import type { ReactNode } from "react";
import {
  View,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Text,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { TeslaHeader } from "@/components/navigation/TeslaHeader";

export interface AddTripModalLayoutProps {
  title: string;
  submitLabel: string;
  canSubmit: boolean;
  submitting?: boolean;
  onClose: () => void;
  onSubmit: () => void;
  children: ReactNode;
}

export function AddTripModalLayout({
  title,
  submitLabel,
  canSubmit,
  submitting = false,
  onClose,
  onSubmit,
  children,
}: AddTripModalLayoutProps) {
  const insets = useSafeAreaInsets();
  const submitDisabled = !canSubmit || submitting;

  return (
    <View style={styles.container}>
      <View style={[styles.darkBlock, { paddingTop: insets.top }]}>
        <TeslaHeader
          title={title}
          subtitle="Route · Client · Allocation"
          variant="dark"
          showBack
          onBack={onClose}
          skipSafeAreaTop
          hideRightIcons
        />
      </View>

      <KeyboardAvoidingView
        style={styles.keyboardWrap}
        behavior={Platform.OS === "ios" ? "padding" : "padding"}
        keyboardVerticalOffset={0}
      >
        <View
          style={[
            styles.body,
            { paddingBottom: Layout.sectionSpacing },
          ]}
        >
          {children}
        </View>

        <View
          style={[
            styles.footer,
            {
              paddingBottom: Layout.fabBottomOffset + insets.bottom,
              paddingTop: Layout.headerPaddingBelowInset,
            },
          ]}
        >
          <TouchableOpacity
            style={[styles.submitBtn, submitDisabled && styles.submitBtnDisabled]}
            onPress={onSubmit}
            disabled={submitDisabled}
            activeOpacity={0.9}
            accessibilityRole="button"
            accessibilityLabel={submitLabel}
            accessibilityHint={
              submitDisabled && !submitting
                ? "Fill required fields first"
                : undefined
            }
          >
            {submitting ? (
              <ActivityIndicator
                size="small"
                color={Theme.buttonPrimaryText}
              />
            ) : (
              <>
                <FontAwesome
                  name="check-circle"
                  size={18}
                  color={Theme.buttonPrimaryText}
                  style={styles.submitIcon}
                />
                <Text style={styles.submitBtnText}>{submitLabel}</Text>
              </>
            )}
          </TouchableOpacity>
          {submitDisabled && !submitting && (
            <Text style={styles.footerHint}>
              Fill client, route, price and allocation to continue
            </Text>
          )}
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.screenBackground,
  },
  darkBlock: {
    backgroundColor: Theme.darkBackground,
    width: "100%",
    paddingBottom: 4,
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
    zIndex: 10,
  },
  keyboardWrap: {
    flex: 1,
    minHeight: 0,
  },
  body: {
    flex: 1,
    minHeight: 0,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: Layout.sectionSpacing,
  },
  footer: {
    backgroundColor: Theme.screenBackground,
    borderTopWidth: 1,
    borderTopColor: Theme.borderLight,
    paddingHorizontal: Layout.screenPaddingHorizontal,
  },
  submitBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.buttonPrimary,
    paddingVertical: 16,
    borderRadius: 12,
    minHeight: Layout.minTouchTargetSize,
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  submitBtnDisabled: {
    opacity: 0.5,
  },
  submitIcon: {
    marginRight: 10,
  },
  submitBtnText: {
    fontSize: 13,
    fontWeight: "800",
    color: Theme.buttonPrimaryText,
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },
  footerHint: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textMutedDemo,
    marginTop: 8,
    textAlign: "center",
  },
});
