import type { ReactNode } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft } from "lucide-react-native";

import Theme from "@/constants/Theme";
import Layout from "@/constants/Layout";
import { dockPaddingBottom, useKeyboardVisible } from "@/lib/hooks/useKeyboardVisible";
import { useViewportHeight, viewportCapStyle } from "@/lib/hooks/useViewportHeight";
import { isDesktopWizardForm } from "@/lib/wizardLayout.util";

import { WizardActionBarProvider } from "./WizardActionBarContext";
import { WizardDesktopFrame } from "./WizardDesktopFrame";
import type { WizardInsightCard } from "./WizardInsightRail";
import { fullPageWizardStyles as styles } from "./fullPageWizardStyles";
import {
  wizardInsightCardsForPreset,
  type WizardInsightPreset,
} from "./wizardDesktopInsights";

export interface FullPageWizardShellProps {
  title: string;
  subtitle?: string;
  /** e.g. 2 when on step 2 of 4 */
  stepIndex?: number;
  stepTotal?: number;
  onBack: () => void;
  backLabel?: string;
  progress?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** Keypad / fill steps — flex body, compact chrome, no ScrollView wrapper */
  fillBody?: boolean;
  /** When true, shell wraps children in ScrollView (simple step content). */
  scrollBody?: boolean;
  /** Marketing / tips side rails on desktop (≥1080px). */
  insightPreset?: WizardInsightPreset;
  /** Trip summary or step context shown in the right rail on desktop. */
  contextPanel?: ReactNode;
  /** When true, use stepped wizard chrome on wide desktop (not enterprise multi-card grid). */
  steppedLayout?: boolean;
}

export function FullPageWizardShell({
  title,
  subtitle,
  stepIndex,
  stepTotal,
  onBack,
  backLabel = "← Back",
  progress,
  children,
  footer,
  fillBody = false,
  scrollBody = false,
  insightPreset = "trip",
  contextPanel,
  steppedLayout = false,
}: FullPageWizardShellProps) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  /** Visible height — tracks URL bar / keyboard on web, unlike window height. */
  const height = useViewportHeight();
  const { keyboardVisible } = useKeyboardVisible();
  const isDesktopRails = width >= Layout.wizardDesktopGridMinWidth;
  const isDesktopForm = steppedLayout ? false : isDesktopWizardForm(width);
  const isMobileWizardLayout =
    steppedLayout ? false : width < Layout.wizardDesktopGridMinWidth;
  const isSteppedDesktop = steppedLayout && width >= 768;
  const isKeypadStep = fillBody && !isSteppedDesktop;
  /** Phone keypad steps host Continue above the pad via context. */
  const hoistFooterIntoKeypad = Boolean(footer && isKeypadStep);
  /**
   * Phone + tablet scroll/fill steps: pin the action bar to the viewport bottom
   * so long forms (Route, Load, …) cannot push Continue off-screen on RN Web.
   * Desktop rails (>= wizardDesktopGridMinWidth) keep the footer in normal flow
   * so it stays attached to the card instead of floating over the page.
   */
  const pinFooterToViewport = Boolean(
    footer &&
      width < Layout.wizardDesktopGridMinWidth &&
      !isSteppedDesktop &&
      !hoistFooterIntoKeypad,
  );
  const mobileFooterReserve = pinFooterToViewport
    ? 88 + dockPaddingBottom(insets.bottom, keyboardVisible, 8)
    : 0;
  const stepLabel =
    stepIndex != null && stepTotal != null && stepTotal > 0
      ? `Step ${stepIndex} of ${stepTotal}`
      : null;

  const { left: leftInsights, right: rightInsights } = isKeypadStep
    ? { left: [] as WizardInsightCard[], right: [] as WizardInsightCard[] }
    : steppedLayout
      ? { left: [] as WizardInsightCard[], right: [] as WizardInsightCard[] }
      : wizardInsightCardsForPreset(insightPreset, { desktopForm: isDesktopForm });

  const footerNode = footer ? (
    <View
      style={[
        styles.footerDock,
        isMobileWizardLayout && styles.footerDockMobile,
        isKeypadStep && styles.footerDockKeypadInline,
        pinFooterToViewport && styles.footerDockMobilePinned,
        {
          paddingBottom: hoistFooterIntoKeypad
            ? 4
            : dockPaddingBottom(insets.bottom, keyboardVisible, 8),
        },
        isKeypadStep && !hoistFooterIntoKeypad && styles.footerDockKeypad,
      ]}
    >
      {footer}
    </View>
  ) : null;

  const body = fillBody ? (
    isKeypadStep && width < Layout.wizardSteppedMaxWidth ? (
      <View style={styles.bodyFill}>{children}</View>
    ) : (
      <ScrollView
        style={styles.bodyFill}
        contentContainerStyle={[
          styles.bodyFillScrollContent,
          pinFooterToViewport && { paddingBottom: mobileFooterReserve },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
    )
  ) : scrollBody ? (
    <ScrollView
      style={styles.bodyScroll}
      contentContainerStyle={[
        styles.bodyScrollContent,
        isMobileWizardLayout && styles.bodyScrollContentMobile,
        pinFooterToViewport && { paddingBottom: mobileFooterReserve },
      ]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
      automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
    >
      {children}
    </ScrollView>
  ) : (
    <View
      style={[
        styles.bodyFill,
        pinFooterToViewport && { paddingBottom: mobileFooterReserve },
      ]}
    >
      {children}
    </View>
  );

  const page = (
    <View
      style={[
        styles.pageRoot,
        isDesktopRails && styles.pageRootInFrame,
        isDesktopForm && styles.pageRootDesktopForm,
        isMobileWizardLayout && styles.pageRootMobileFull,
        isKeypadStep && styles.pageRootKeypad,
        isSteppedDesktop && styles.pageRootSteppedDesktop,
        {
          /**
           * Keep header + body + footer inside the visible viewport.
           * `pageRoot` is already `flex: 1`, so on web we only need a cap in
           * dynamic-viewport units — `100dvh` follows the mobile URL bar
           * collapsing, which a measured pixel height cannot. Native has no
           * URL bar, so the measured height is exact there.
           */
          ...(pinFooterToViewport && viewportCapStyle(height)),
          ...(hoistFooterIntoKeypad && !pinFooterToViewport
            ? viewportCapStyle(height)
            : null),
          paddingTop: insets.top + (isKeypadStep || isSteppedDesktop ? 4 : 6),
          paddingBottom: hoistFooterIntoKeypad
            ? Math.max(insets.bottom, 6)
            : pinFooterToViewport
              ? 0
              : footer
                ? 0
                : Math.max(
                    insets.bottom,
                    isKeypadStep || isSteppedDesktop ? 6 : 10,
                  ),
        },
      ]}
    >
      <View
        style={[
          styles.headerBar,
          isMobileWizardLayout && styles.headerBarMobile,
          isKeypadStep && styles.headerBarKeypad,
        ]}
      >
        <Pressable
          style={[styles.headerBackBtn, isMobileWizardLayout && styles.headerBackBtnMobile]}
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel={backLabel.replace(/^←\s*/, "") || "Back"}
          hitSlop={8}
        >
          <ArrowLeft
            size={isMobileWizardLayout ? 16 : 18}
            color={Theme.textPrimaryDark}
            strokeWidth={2.5}
          />
          <Text
            style={[
              styles.headerBackBtnText,
              isMobileWizardLayout && styles.headerBackBtnTextMobile,
            ]}
          >
            {backLabel.replace(/^←\s*/, "") || "Back"}
          </Text>
        </Pressable>
        <View style={styles.headerTitleCluster} pointerEvents="none">
          <Text
            style={[
              styles.titleInline,
              isMobileWizardLayout && styles.titleInlineMobile,
              isKeypadStep && styles.titleInlineKeypad,
            ]}
            numberOfLines={1}
          >
            {title}
          </Text>
        </View>
        {stepLabel ? (
          <View style={styles.headerStepBadge}>
            <Text
              style={[
                styles.headerStepText,
                isMobileWizardLayout && styles.headerStepTextMobile,
              ]}
            >
              {stepLabel}
            </Text>
          </View>
        ) : (
          <View style={styles.headerStepBadgeSpacer} />
        )}
      </View>

      {subtitle && !isKeypadStep ? (
        <View style={styles.pageHeaderBlock}>
          <Text
            style={[
              styles.subtitle,
              isMobileWizardLayout && styles.subtitleMobile,
            ]}
            numberOfLines={3}
          >
            {subtitle}
          </Text>
        </View>
      ) : null}

      {progress ? (
        <View
          style={[
            { flexShrink: 0 },
            isKeypadStep && styles.progressPadKeypad,
          ]}
        >
          {progress}
        </View>
      ) : null}

      {body}

      {!hoistFooterIntoKeypad ? footerNode : null}
    </View>
  );

  return (
    <View style={styles.root}>
      <KeyboardAvoidingView
        style={styles.shellKeyboard}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        enabled={Platform.OS !== "web"}
        keyboardVerticalOffset={Platform.OS === "ios" ? insets.top + 8 : 0}
      >
        <WizardActionBarProvider value={hoistFooterIntoKeypad ? footerNode : null}>
          <WizardDesktopFrame
            width={width}
            leftInsights={[...leftInsights]}
            rightInsights={[...rightInsights]}
            contextPanel={contextPanel}
          >
            {page}
          </WizardDesktopFrame>
        </WizardActionBarProvider>
      </KeyboardAvoidingView>
    </View>
  );
}
