/**
 * Create Trip — matches app layout and theme (TreasuryDetailLayout pattern).
 * TeslaHeader (dark) + scroll body + sticky CTA. Layout + Theme only.
 */
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import type { ReactNode } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export interface AddTripModalLayoutProps {
  title: string;
  /** Subtitle under the title (dark header). Defaults to Create Trip copy. */
  subtitle?: string;
  submitLabel: string;
  canSubmit: boolean;
  submitting?: boolean;
  /** When false, the page puts the primary action inside the form (e.g. centered CTA). */
  showFooter?: boolean;
  onClose: () => void;
  onSubmit: () => void;
  children: ReactNode;
}

export function AddTripModalLayout({
  title,
  subtitle = "Route · Client & Price · Allocation",
  submitLabel,
  canSubmit,
  submitting = false,
  showFooter = true,
  onClose,
  onSubmit,
  children,
}: AddTripModalLayoutProps) {
  const insets = useSafeAreaInsets();
  const { width: winW } = useWindowDimensions();
  const isCompactMobile = winW < 480;
  const submitDisabled = !canSubmit || submitting;
  const showHeaderActions = !showFooter;

  return (
    <View style={styles.container}>
      <View style={[styles.topBar, isCompactMobile && styles.topBarCompact, { paddingTop: insets.top + 10 }]}>
        <View style={[styles.topBarMain, isCompactMobile && styles.topBarMainCompact]}>
          <View style={styles.topBarLeft}>
            <TouchableOpacity style={styles.topBarBackBtn} onPress={onClose} activeOpacity={0.85}>
              <FontAwesome name="chevron-left" size={16} color={Theme.textPrimaryDark} />
            </TouchableOpacity>
            <View style={styles.topBarTextWrap}>
              <Text style={styles.topBarTitle}>{title}</Text>
              <Text style={styles.topBarSubtitle}>{subtitle}</Text>
            </View>
          </View>
          {showHeaderActions ? (
            <View style={[styles.topBarActions, isCompactMobile && styles.topBarActionsCompact]}>
              <TouchableOpacity style={styles.topBarCancelBtn} onPress={onClose} activeOpacity={0.85}>
                <Text style={styles.topBarCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.topBarSaveBtn, submitDisabled && styles.topBarSaveBtnDisabled]}
                onPress={onSubmit}
                disabled={submitDisabled}
                activeOpacity={0.9}
              >
                {submitting ? (
                  <ActivityIndicator size="small" color={Theme.textOnPrimary} />
                ) : (
                  <Text style={styles.topBarSaveText}>{submitLabel}</Text>
                )}
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
      </View>
      
      <KeyboardAvoidingView
        style={styles.keyboardWrap}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={0}
      >
        <View style={[styles.body, isCompactMobile && styles.bodyCompact, { paddingBottom: Layout.sectionSpacing + insets.bottom }]}>
          {children}
        </View>

        {showFooter ? (
          <View
            style={[
              styles.footer,
              {
                paddingBottom: insets.bottom + 12,
                paddingTop: 8,
              },
            ]}
          >
            <TouchableOpacity
              style={[
                styles.submitBtn,
                submitDisabled && styles.submitBtnDisabled,
              ]}
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
                    color={Theme.buttonMatteBlackText}
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
        ) : null}
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.screenBackground,
  },
  topBar: {
    width: "100%",
    paddingBottom: 10,
    paddingHorizontal: 14,
    backgroundColor: Theme.screenBackground,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  topBarCompact: {
    paddingHorizontal: 10,
  },
  topBarMain: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  topBarMainCompact: {
    alignItems: "flex-start",
  },
  topBarLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  topBarBackBtn: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.surfaceForm,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    marginRight: 10,
  },
  topBarTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  topBarTitle: {
    fontSize: 20,
    fontWeight: "900",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.45,
    textTransform: "uppercase",
    fontStyle: "italic",
  },
  topBarSubtitle: {
    marginTop: 3,
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },
  topBarActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 8,
  },
  topBarActionsCompact: {
    width: "100%",
    justifyContent: "flex-end",
    marginTop: 8,
  },
  topBarCancelBtn: {
    minHeight: 38,
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surfaceForm,
  },
  topBarCancelText: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  topBarSaveBtn: {
    minHeight: 38,
    paddingVertical: 9,
    paddingHorizontal: 18,
    borderRadius: 11,
    backgroundColor: Theme.darkBackground,
  },
  topBarSaveBtnDisabled: {
    opacity: 0.5,
  },
  topBarSaveText: {
    fontSize: 11,
    fontWeight: "900",
    color: Theme.textOnPrimary,
    textTransform: "uppercase",
    letterSpacing: 0.9,
  },
  keyboardWrap: {
    flex: 1,
    minHeight: 0,
  },
  body: {
    flex: 1,
    minHeight: 0,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 12,
  },
  bodyCompact: {
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  footer: {
    marginTop: 8,
    backgroundColor: Theme.surface,
    borderTopWidth: 1,
    borderTopColor: Theme.borderLight,
    borderRadius: 16,
    paddingHorizontal: 8,
  },
  submitBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.buttonMatteBlack,
    paddingVertical: 12,
    borderRadius: 16,
    minHeight: Layout.minTouchTargetSize + 12,
    shadowColor: Theme.buttonMatteBlack,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.16,
    shadowRadius: 10,
    elevation: 3,
  },
  submitBtnDisabled: {
    opacity: 0.5,
  },
  submitIcon: {
    marginRight: 10,
  },
  submitBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.buttonMatteBlackText,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  footerHint: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textMutedDemo,
    marginTop: 8,
    textAlign: "center",
  },
});
