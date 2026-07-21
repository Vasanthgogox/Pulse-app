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
import { Layout } from "@/constants/Layout";
import { dockPaddingBottom, useKeyboardVisible } from "@/lib/hooks/useKeyboardVisible";
import { isDesktopWizardForm } from "@/lib/wizardLayout.util";

import { WizardDesktopFrame } from "./WizardDesktopFrame";
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
  const { keyboardVisible } = useKeyboardVisible();
  const isDesktopRails = width >= Layout.wizardDesktopGridMinWidth;
  const isDesktopForm = steppedLayout ? false : isDesktopWizardForm(width);
  const isMobileWizardLayout =
    steppedLayout ? false : width < Layout.wizardDesktopGridMinWidth;
  const isSteppedDesktop = steppedLayout && width >= 768;
  const isKeypadStep = fillBody && !isSteppedDesktop;
  const stepLabel =
    stepIndex != null && stepTotal != null && stepTotal > 0
      ? `Step ${stepIndex} of ${stepTotal}`
      : null;

  const { left: leftInsights, right: rightInsights } = isKeypadStep
    ? { left: [] as const, right: [] as const }
    : steppedLayout
      ? { left: [] as const, right: [] as const }
      : wizardInsightCardsForPreset(insightPreset, { desktopForm: isDesktopForm });

  const body = fillBody ? (
    <View style={styles.bodyFill}>{children}</View>
  ) : scrollBody ? (
    <ScrollView
      style={styles.bodyScroll}
      contentContainerStyle={styles.bodyScrollContent}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
      automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={styles.bodyFill}>{children}</View>
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
          paddingTop: insets.top + (isKeypadStep || isSteppedDesktop ? 4 : 6),
          /** Safe area lives on the footer dock so Continue stays above the home indicator. */
          paddingBottom: footer
            ? 0
            : Math.max(insets.bottom, isKeypadStep || isSteppedDesktop ? 6 : 10),
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
          <ArrowLeft size={18} color={Theme.textPrimaryDark} strokeWidth={2.5} />
          <Text style={styles.headerBackBtnText}>
            {backLabel.replace(/^←\s*/, "") || "Back"}
          </Text>
        </Pressable>
        <View style={styles.headerTitleCluster} pointerEvents="none">
          <Text
            style={[styles.titleInline, isKeypadStep && styles.titleInlineKeypad]}
            numberOfLines={1}
          >
            {title}
          </Text>
        </View>
        {stepLabel ? (
          <View style={styles.headerStepBadge}>
            <Text style={styles.headerStepText}>{stepLabel}</Text>
          </View>
        ) : (
          <View style={styles.headerStepBadgeSpacer} />
        )}
      </View>

      {subtitle ? (
        <View style={[styles.pageHeaderBlock, isKeypadStep && styles.pageHeaderBlockKeypad]}>
          <Text
            style={[styles.subtitle, isKeypadStep && styles.subtitleKeypad]}
            numberOfLines={isKeypadStep ? 2 : 3}
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

      {footer ? (
        <View
          style={[
            {
              flexShrink: 0,
              width: "100%",
              backgroundColor: Theme.cardWhite,
              paddingBottom: dockPaddingBottom(insets.bottom, keyboardVisible, 8),
            },
            isKeypadStep && styles.footerDockKeypad,
          ]}
        >
          {footer}
        </View>
      ) : null}
    </View>
  );

  return (
    <View style={styles.root}>
      <KeyboardAvoidingView
        style={{ flex: 1, width: "100%", minHeight: 0 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        enabled={Platform.OS !== "web"}
        keyboardVerticalOffset={Platform.OS === "ios" ? insets.top + 8 : 0}
      >
        <WizardDesktopFrame
          width={width}
          leftInsights={[...leftInsights]}
          rightInsights={[...rightInsights]}
          contextPanel={contextPanel}
        >
          {page}
        </WizardDesktopFrame>
      </KeyboardAvoidingView>
    </View>
  );
}
