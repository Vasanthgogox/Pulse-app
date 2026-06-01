import { memo, type ReactNode } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowRight, ChevronLeft } from "lucide-react-native";

import Theme from "@/constants/Theme";
import { partyMobileWizardStyles as styles } from "./partyMobileWizardStyles";

export interface PartyMobileWizardShellProps {
  entityTitle: string;
  subtitle?: string;
  stepIds: readonly string[];
  currentStep: string;
  onStepBack: () => void;
  onClose: () => void;
  stepTitle: string;
  stepHint: string;
  showEntitySubtitle?: boolean;
  formError: string | null;
  noOrganizationBanner?: ReactNode;
  children: ReactNode;
  hideFooter?: boolean;
  /** Keypad steps: flex body + no keyboard avoidance (custom pad at bottom). */
  bodyLayout?: "default" | "keypad";
  canAdvance?: boolean;
  onAdvance?: () => void;
  advanceLabel?: string;
}

export const PartyMobileWizardShell = memo(function PartyMobileWizardShell({
  entityTitle,
  subtitle = "Fill required fields and continue.",
  stepIds,
  currentStep,
  onStepBack,
  onClose,
  stepTitle,
  stepHint,
  showEntitySubtitle = false,
  formError,
  noOrganizationBanner,
  children,
  hideFooter = false,
  bodyLayout = "default",
  canAdvance = false,
  onAdvance,
  advanceLabel = "Continue",
}: PartyMobileWizardShellProps) {
  const insets = useSafeAreaInsets();
  const currentIdx = Math.max(0, stepIds.indexOf(currentStep));

  const isKeypadLayout = bodyLayout === "keypad";

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={
        isKeypadLayout ? undefined : Platform.OS === "ios" ? "padding" : undefined
      }
    >
      <View style={[styles.root, styles.shellColumn, { paddingTop: insets.top }]}>
        <View style={styles.topBar}>
          <Pressable
            style={styles.backBtn}
            onPress={currentIdx <= 0 ? onClose : onStepBack}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <ChevronLeft size={20} color={Theme.textPrimaryDark} strokeWidth={2.5} />
          </Pressable>
          <View style={styles.progressRow}>
            {stepIds.map((id, i) => (
              <View
                key={id}
                style={[
                  styles.progressDot,
                  i <= currentIdx && styles.progressDotActive,
                ]}
              />
            ))}
          </View>
          <View style={styles.backBtnSpacer} />
        </View>

        <View style={styles.hero}>
          <View style={styles.titleRow}>
            <View style={styles.liveDot} />
            <Text style={styles.entityTitle}>{entityTitle}</Text>
          </View>
          {showEntitySubtitle ? (
            <Text style={styles.subtitle}>{subtitle}</Text>
          ) : null}
        </View>

        {noOrganizationBanner}

        {formError ? (
          <View style={styles.errorBar}>
            <Text style={styles.errorText}>{formError}</Text>
          </View>
        ) : null}

        <View
          style={[
            styles.body,
            isKeypadLayout
              ? styles.bodyKeypad
              : hideFooter
                ? styles.bodySource
                : styles.bodyFields,
          ]}
        >
          <View style={isKeypadLayout ? styles.bodyKeypadHeader : undefined}>
            <Text style={styles.stepTitle}>{stepTitle}</Text>
            {isKeypadLayout ? (
              <Text style={styles.stepHintKeypad}>{stepHint}</Text>
            ) : stepHint ? (
              <Text style={styles.stepHint}>{stepHint}</Text>
            ) : null}
          </View>
          {isKeypadLayout ? (
            <View style={styles.bodyKeypadContent}>{children}</View>
          ) : (
            children
          )}
        </View>

        {!hideFooter ? (
          <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
            <Pressable
              style={[styles.fab, !canAdvance && styles.fabDisabled]}
              onPress={onAdvance}
              disabled={!canAdvance}
              accessibilityRole="button"
              accessibilityLabel={advanceLabel}
            >
              <ArrowRight size={20} color={Theme.textOnPrimary} strokeWidth={2.8} />
            </Pressable>
            <Text style={styles.footerHint}>{advanceLabel}</Text>
          </View>
        ) : null}
      </View>
    </KeyboardAvoidingView>
  );
});
