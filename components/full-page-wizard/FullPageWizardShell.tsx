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
import { fullPageWizardStyles as styles } from "./fullPageWizardStyles";

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
}: FullPageWizardShellProps) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { keyboardVisible } = useKeyboardVisible();
  const isWide = width >= Layout.wizardBodyMaxWidth;
  const isKeypadStep = fillBody;
  const stepLabel =
    stepIndex != null && stepTotal != null && stepTotal > 0
      ? `Step ${stepIndex} of ${stepTotal}`
      : null;

  const body = fillBody ? (
    <View style={[styles.bodyFill, isWide && styles.bodyWide]}>{children}</View>
  ) : scrollBody ? (
    <ScrollView
      style={styles.bodyScroll}
      contentContainerStyle={[styles.bodyScrollContent, isWide && styles.bodyWide]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
      automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.bodyFill, isWide && styles.bodyWide]}>{children}</View>
  );

  return (
    <View style={styles.root}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        enabled={Platform.OS !== "web"}
        keyboardVerticalOffset={Platform.OS === "ios" ? insets.top + 8 : 0}
      >
        <View
          style={[
            styles.pageRoot,
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
            {stepLabel ? <Text style={styles.headerStepText}>{stepLabel}</Text> : null}
          </View>

          <View style={[styles.pageHeaderBlock, isKeypadStep && styles.pageHeaderBlockKeypad]}>
            <Text style={[styles.title, isKeypadStep && styles.titleKeypad]} numberOfLines={2}>
              {title}
            </Text>
            {subtitle ? (
              <Text
                style={[styles.subtitle, isKeypadStep && styles.subtitleKeypad]}
                numberOfLines={isKeypadStep ? 2 : 4}
              >
                {subtitle}
              </Text>
            ) : null}
          </View>

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
      </KeyboardAvoidingView>
    </View>
  );
}
