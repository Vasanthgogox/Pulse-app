/**
 * Shared mobile-first shell for trip driver/vehicle allocation & reassign flows.
 * Matches Create Trip allocation wizard chrome (pulse header + sticky footer).
 */
import type { ReactNode } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { ChevronLeft } from "lucide-react-native";

import Theme from "@/constants/Theme";
import {
  assignmentShellColors,
  assignmentShellStyles,
} from "@/features/trips/styles/assignmentShellShared";
import { PULSE_TRIP } from "@/features/trips/components/add-trip/addTripPulseTheme";
import {
  dockPaddingBottom,
  useKeyboardVisible,
} from "@/lib/hooks/useKeyboardVisible";

export interface AssignmentFlowShellProps {
  title: string;
  subtitle?: string;
  onClose: () => void;
  onBack?: () => void;
  showBack?: boolean;
  progress?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** Pulse = Create Trip allocation header; slate = assignment modal card */
  variant?: "pulse" | "slate";
  submitting?: boolean;
  /** Trip detail route: edge-to-edge on device (no web modal chrome). */
  fullScreen?: boolean;
}

export function AssignmentFlowShell({
  title,
  subtitle,
  onClose,
  onBack,
  showBack = false,
  progress,
  children,
  footer,
  variant = "pulse",
  submitting = false,
  fullScreen = false,
}: AssignmentFlowShellProps) {
  const insets = useSafeAreaInsets();
  const { width: winW } = useWindowDimensions();
  const { keyboardVisible } = useKeyboardVisible();
  const webDesktopContent =
    Platform.OS === "web" && winW >= 900
      ? { maxWidth: Math.min(winW - 48, 880), alignSelf: "center" as const, width: "100%" as const }
      : undefined;
  const isPulse = variant === "pulse";
  const footerPad = dockPaddingBottom(insets.bottom, keyboardVisible, 12);

  const header = isPulse ? (
    <View style={[styles.pulseHeader, { paddingTop: insets.top + 10 }]}>
      <View style={styles.pulseHeaderRow}>
        <View style={styles.pulseHeaderLeft}>
          {showBack && onBack ? (
            <TouchableOpacity
              style={styles.pulseBackBtn}
              onPress={onBack}
              activeOpacity={0.85}
              accessibilityLabel="Back"
            >
              <ChevronLeft size={20} color={PULSE_TRIP.text} strokeWidth={2.5} />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.pulseBackBtn}
              onPress={onClose}
              activeOpacity={0.85}
              accessibilityLabel="Close"
            >
              <FontAwesome name="chevron-left" size={16} color="#e2e8f0" />
            </TouchableOpacity>
          )}
          <View style={styles.pulseHeaderText}>
            <Text style={styles.pulseTitle} numberOfLines={1}>
              {title}
            </Text>
            {subtitle ? (
              <Text style={styles.pulseSubtitle} numberOfLines={2}>
                {subtitle}
              </Text>
            ) : null}
          </View>
        </View>
        {submitting ? (
          <ActivityIndicator color="#e2e8f0" size="small" />
        ) : (
          <TouchableOpacity
            onPress={onClose}
            hitSlop={10}
            activeOpacity={0.85}
            accessibilityLabel="Close"
          >
            <Text style={styles.pulseCancel}>Cancel</Text>
          </TouchableOpacity>
        )}
      </View>
      {progress ? <View style={styles.progressWrap}>{progress}</View> : null}
    </View>
  ) : (
    <View style={[assignmentShellStyles.modalHero, { paddingTop: insets.top + 8 }]}>
      <View style={assignmentShellStyles.modalHeroText}>
        {showBack && onBack ? (
          <TouchableOpacity
            style={assignmentShellStyles.wizardBackPill}
            onPress={onBack}
            activeOpacity={0.85}
          >
            <ChevronLeft size={14} color={Theme.primary} strokeWidth={2.5} />
            <Text style={assignmentShellStyles.wizardBackText}>Back</Text>
          </TouchableOpacity>
        ) : null}
        <Text style={assignmentShellStyles.modalTitle}>{title}</Text>
        {subtitle ? (
          <Text style={assignmentShellStyles.modalSubtitle}>{subtitle}</Text>
        ) : null}
      </View>
      <TouchableOpacity
        onPress={onClose}
        style={assignmentShellStyles.modalCloseBtn}
        hitSlop={8}
        accessibilityLabel="Close"
      >
        <FontAwesome name="times" size={18} color={Theme.textMuted} />
      </TouchableOpacity>
      {progress ? <View style={styles.progressWrapSlate}>{progress}</View> : null}
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={[
        styles.root,
        isPulse ? styles.rootPulse : styles.rootSlate,
        fullScreen ? styles.rootFullScreen : { flex: Platform.OS === "web" ? 0 : 1 },
      ]}
      behavior={Platform.OS === "ios" ? "padding" : "padding"}
      keyboardVerticalOffset={insets.top}
    >
      {header}
      <ScrollView
        style={styles.body}
        contentContainerStyle={[
          styles.bodyContent,
          fullScreen && styles.bodyContentFullScreen,
          isPulse ? styles.bodyContentPulse : styles.bodyContentSlate,
          webDesktopContent,
          !footer && { paddingBottom: Math.max(24, insets.bottom) },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
      {footer ? (
        <View
          style={[
            isPulse ? styles.footerPulse : assignmentShellStyles.modalFooterBar,
            { paddingBottom: footerPad },
          ]}
        >
          {footer}
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    overflow: "hidden",
    ...Platform.select({
      web: { maxHeight: "92%", minHeight: 420 } as object,
      default: { flex: 1, minHeight: 0 },
    }),
  },
  rootFullScreen: {
    flex: 1,
    minHeight: 0,
    borderRadius: 0,
    ...Platform.select({
      web: { width: "100%", maxHeight: "none", height: "100%" } as object,
      default: {},
    }),
  },
  rootPulse: {
    backgroundColor: PULSE_TRIP.screenBg,
    borderRadius: Platform.OS === "web" ? 16 : 0,
  },
  rootSlate: {
    backgroundColor: assignmentShellColors.cardSlateBody,
    borderRadius: Platform.OS === "web" ? 14 : 0,
  },
  pulseHeader: {
    backgroundColor: PULSE_TRIP.headerNavy,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  pulseHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  pulseHeaderLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minWidth: 0,
  },
  pulseBackBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  pulseHeaderText: { flex: 1, minWidth: 0 },
  pulseTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#f8fafc",
    letterSpacing: -0.25,
  },
  pulseSubtitle: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: "500",
    color: "rgba(226,232,240,0.88)",
    lineHeight: 15,
  },
  pulseCancel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#c7d2fe",
  },
  progressWrap: {
    marginTop: 14,
    paddingTop: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.12)",
  },
  progressWrapSlate: {
    width: "100%",
    marginTop: 12,
  },
  body: { flex: 1, minHeight: 0 },
  bodyContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  bodyContentFullScreen: {
    paddingHorizontal: 14,
    paddingTop: 12,
  },
  bodyContentPulse: {
    backgroundColor: PULSE_TRIP.screenBg,
  },
  bodyContentSlate: {
    backgroundColor: "#f8fafc",
  },
  footerPulse: {
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: PULSE_TRIP.cardBg,
    borderTopWidth: 1,
    borderTopColor: PULSE_TRIP.border,
    gap: 10,
  },
});
