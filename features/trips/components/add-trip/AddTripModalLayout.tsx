/**
 * Create Trip — matches app layout and theme (TreasuryDetailLayout pattern).
 * TeslaHeader (dark) + scroll body + sticky CTA. Layout + Theme only.
 */
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { FinanceTxnTypography } from "@/constants/FinanceTxnTypography";
import { PULSE_TRIP, PULSE_TRIP_RADIUS } from "./addTripPulseTheme";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useOptionalKeyboardAccessory } from "@/contexts/KeyboardAccessoryContext";
import { dockPaddingBottom, useKeyboardVisible } from "@/lib/hooks/useKeyboardVisible";
import { KEYBOARD_ACCESSORY_BAR_HEIGHT } from "@/components/AppKeyboardAccessory";
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
  /**
   * When true (default), primary action stays disabled until the form is valid.
   * When false, only `submitting` disables the button — caller should validate on press and show errors (e.g. Create Trip).
   */
  lockPrimaryUntilValid?: boolean;
  validationMessage?: string | null;
  submitting?: boolean;
  /** When false, the page puts the primary action inside the form (e.g. centered CTA). */
  showFooter?: boolean;
  /** Optional override for rendering top-right header actions. */
  showHeaderActions?: boolean;
  /**
   * Preferred primary action surface.
   * - "header": render action in header
   * - "footer": render sticky footer action
   * - "content": caller renders action inside children
   * - "auto": keep legacy showFooter/showHeaderActions behavior
   */
  primaryActionMode?: "auto" | "header" | "footer" | "content";
  onClose: () => void;
  onSubmit: () => void;
  children: ReactNode;
}

export function AddTripModalLayout({
  title,
  subtitle = "Route · Commodity · Client & Price · Allocation",
  submitLabel,
  canSubmit,
  lockPrimaryUntilValid = true,
  validationMessage = null,
  submitting = false,
  showFooter = true,
  showHeaderActions,
  primaryActionMode = "auto",
  onClose,
  onSubmit,
  children,
}: AddTripModalLayoutProps) {
  const insets = useSafeAreaInsets();
  const { width: winW } = useWindowDimensions();
  const { keyboardVisible } = useKeyboardVisible();
  const keyboardAccessory = useOptionalKeyboardAccessory();
  const extraAndroidAccessoryPad =
    Platform.OS === "android" &&
    keyboardVisible &&
    (keyboardAccessory?.accessoryBarActive ?? false)
      ? KEYBOARD_ACCESSORY_BAR_HEIGHT
      : 0;
  const isCompactMobile = winW < 480;
  const isDesktopWeb = Platform.OS === "web" && winW >= 1080;
  const isDenseForm = Platform.OS !== "web" || winW < 600 || isDesktopWeb;
  const footerBottomPad = dockPaddingBottom(
    insets.bottom,
    keyboardVisible,
    isDenseForm ? 8 : 12,
  );
  const submitDisabled =
    submitting || (lockPrimaryUntilValid ? !canSubmit : false);
  const shouldShowFooter =
    primaryActionMode === "footer"
      ? true
      : primaryActionMode === "header" || primaryActionMode === "content"
        ? false
        : showFooter;
  const shouldShowHeaderActions =
    primaryActionMode === "header"
      ? true
      : primaryActionMode === "footer" || primaryActionMode === "content"
        ? false
        : (showHeaderActions ?? !showFooter);

  return (
    <View style={styles.container}>
      <View style={[styles.topBar, isCompactMobile && styles.topBarCompact, { paddingTop: insets.top + 10 }]}>
        <View style={[styles.topBarMain, isCompactMobile && styles.topBarMainCompact]}>
          <View style={[styles.topBarLeft, isCompactMobile && styles.topBarLeftCompact]}>
            <TouchableOpacity style={styles.topBarBackBtn} onPress={onClose} activeOpacity={0.85}>
              <FontAwesome name="chevron-left" size={16} color={PULSE_TRIP.text} />
            </TouchableOpacity>
            <View style={styles.topBarTextWrap}>
              <Text style={[styles.topBarTitle, isDesktopWeb && styles.topBarTitleDesktop]}>
                {title}
              </Text>
              {subtitle ? (
                <Text style={[styles.topBarSubtitle, isDesktopWeb && styles.topBarSubtitleDesktop]}>
                  {subtitle}
                </Text>
              ) : null}
            </View>
          </View>
          {shouldShowHeaderActions ? (
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
        behavior={Platform.OS === "ios" ? "padding" : "padding"}
        keyboardVerticalOffset={0}
        enabled={Platform.OS !== "web"}
      >
        <View
          style={[
            styles.body,
            isCompactMobile && styles.bodyCompact,
            isDenseForm && !isDesktopWeb && styles.bodyDense,
            {
              paddingBottom:
                (isDenseForm ? 8 : Layout.sectionSpacing) +
                dockPaddingBottom(insets.bottom, keyboardVisible) +
                extraAndroidAccessoryPad,
            },
          ]}
        >
          {children}
        </View>

        {shouldShowFooter ? (
          <View
            style={[
              styles.footer,
              isDenseForm && !isDesktopWeb && styles.footerDense,
              {
                paddingBottom: footerBottomPad,
                paddingTop: isDenseForm ? 6 : 8,
              },
            ]}
          >
            <TouchableOpacity
              style={[
                styles.submitBtn,
                isDenseForm && styles.submitBtnDense,
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
                    color="#ffffff"
                    style={styles.submitIcon}
                  />
                  <Text style={styles.submitBtnText}>{submitLabel}</Text>
                </>
              )}
            </TouchableOpacity>
            {submitDisabled && !submitting && (
              <Text style={[styles.footerHint, isDenseForm && styles.footerHintDense]}>
                {validationMessage ?? "Fill client, route, price and allocation to continue"}
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
    backgroundColor: PULSE_TRIP.screenBg,
  },
  topBar: {
    width: "100%",
    paddingBottom: 10,
    paddingHorizontal: 16,
    backgroundColor: PULSE_TRIP.cardBg,
    borderBottomWidth: 1,
    borderBottomColor: PULSE_TRIP.border,
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 1,
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
    flexDirection: "column",
    alignItems: "flex-start",
    gap: 8,
  },
  topBarLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  topBarLeftCompact: {
    width: "100%",
  },
  topBarBackBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f1f5f9",
    borderWidth: 0,
    marginRight: 10,
  },
  topBarTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  topBarTitle: {
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: -0.4,
    color: PULSE_TRIP.text,
  },
  topBarTitleDesktop: {
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
  topBarSubtitle: {
    fontSize: 10,
    fontWeight: "700",
    fontStyle: "normal",
    marginTop: 3,
    letterSpacing: 0.7,
    textTransform: "uppercase",
    color: PULSE_TRIP.indigo,
  },
  topBarSubtitleDesktop: {
    fontSize: 9,
    fontWeight: "600",
    letterSpacing: 0.55,
    marginTop: 2,
    color: Theme.textMuted,
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
    marginTop: 2,
    flexWrap: "wrap",
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
    minHeight: 40,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: PULSE_TRIP_RADIUS.chip,
    backgroundColor: PULSE_TRIP.indigo,
    shadowColor: PULSE_TRIP.indigo,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 4,
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
    ...Platform.select({
      web: { paddingHorizontal: 0, paddingTop: 4 },
      default: {
        paddingHorizontal: Layout.screenPaddingHorizontal,
        paddingTop: 12,
      },
    }),
  },
  bodyCompact: {
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  bodyDense: {
    paddingHorizontal: 10,
    paddingTop: 4,
  },
  footer: {
    marginTop: 4,
    backgroundColor: PULSE_TRIP.cardBg,
    paddingHorizontal: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: PULSE_TRIP.border,
  },
  footerDense: {
    marginTop: 2,
    paddingHorizontal: 6,
  },
  submitBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: PULSE_TRIP.indigo,
    paddingVertical: 16,
    borderRadius: PULSE_TRIP_RADIUS.btn,
    minHeight: Layout.minTouchTargetSize + 8,
    shadowColor: PULSE_TRIP.indigo,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 14,
    elevation: 5,
  },
  submitBtnDense: {
    paddingVertical: 10,
    borderRadius: 12,
    minHeight: Layout.minTouchTargetSize,
  },
  submitBtnDisabled: {
    opacity: 0.5,
  },
  submitIcon: {
    marginRight: 10,
  },
  submitBtnText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#ffffff",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  footerHint: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textMutedDemo,
    marginTop: 8,
    textAlign: "center",
  },
  footerHintDense: {
    fontSize: 10,
    marginTop: 5,
    lineHeight: 14,
  },
});
