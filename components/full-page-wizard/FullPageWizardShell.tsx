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
}: FullPageWizardShellProps) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { keyboardVisible } = useKeyboardVisible();
  const isDesktopRails = width >= Layout.wizardDesktopGridMinWidth;
  const isDesktopForm = isDesktopWizardForm(width);
  const isMobileWizardLayout = width < Layout.wizardDesktopGridMinWidth;
  const isKeypadStep = fillBody;
  const stepLabel =
    stepIndex != null && stepTotal != null && stepTotal > 0
      ? `Step ${stepIndex} of ${stepTotal}`
      : null;

  const { left: leftInsights, right: rightInsights } = wizardInsightCardsForPreset(
    insightPreset,
    { desktopForm: isDesktopForm },
  );

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
        {
          paddingTop: insets.top + (isKeypadStep ? 4 : 6),
          paddingBottom: Math.max(insets.bottom, isKeypadStep ? 6 : 10),
        },
      ]}
    >
      <View style={styles.headerBar}>
        <Pressable style={styles.headerBackBtn} onPress={onBack} accessibilityLabel="Back">
          <Text style={styles.headerBackBtnText}>{backLabel}</Text>
        </Pressable>
        <View style={styles.headerTitleCluster}>
          <Text
            style={[styles.titleInline, isKeypadStep && styles.titleInlineKeypad]}
            numberOfLines={1}
          >
            {title}
          </Text>
        </View>
        {stepLabel ? <Text style={styles.headerStepText}>{stepLabel}</Text> : null}
      </View>

      {subtitle ? (
        <View style={[styles.pageHeaderBlock, isKeypadStep && styles.pageHeaderBlockKeypad]}>
          <Text
            style={[styles.subtitle, isKeypadStep && styles.subtitleKeypad]}
            numberOfLines={isKeypadStep ? 2 : 4}
          >
            {subtitle}
          </Text>
        </View>
      ) : null}

      {progress ? <View style={{ flexShrink: 0 }}>{progress}</View> : null}

      {body}

      {footer ? (
        <View
          style={{
            flexShrink: 0,
            paddingBottom: dockPaddingBottom(insets.bottom, keyboardVisible, 0),
          }}
        >
          {footer}
        </View>
      ) : null}
    </View>
  );

  return (
    <View style={styles.root}>
      <KeyboardAvoidingView
        style={{ flex: 1, width: "100%" }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        enabled={Platform.OS !== "web"}
        keyboardVerticalOffset={Platform.OS === "ios" ? insets.top + 8 : 0}
      >
        <WizardDesktopFrame
          width={width}
          leftInsights={leftInsights}
          rightInsights={rightInsights}
          contextPanel={contextPanel}
        >
          {page}
        </WizardDesktopFrame>
      </KeyboardAvoidingView>
    </View>
  );
}
