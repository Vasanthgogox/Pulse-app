import { memo, type ReactNode } from "react";
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
  const { width } = useWindowDimensions();
  const currentIdx = Math.max(0, stepIds.indexOf(currentStep));

  const isKeypadLayout = bodyLayout === "keypad";
  // The party wizards are always hosted in a bounded, centered card on web ≥ 720.
  // There the shell must size to its content instead of stretching (flex:1) to a
  // fixed card height, which would leave a large empty gap above the footer.
  const cardFit = Platform.OS === "web" && width >= 720;

  const stepContent = (
    <>
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
            ? cardFit
              ? styles.bodyKeypadFit
              : styles.bodyKeypad
            : hideFooter
              ? styles.bodySource
              : cardFit
                ? styles.bodyFieldsFit
                : styles.bodyFields,
        ]}
      >
        <View style={isKeypadLayout ? styles.bodyKeypadHeader : undefined}>
          <Text style={[styles.stepTitle, cardFit && styles.stepTitleCompact]}>
            {stepTitle}
          </Text>
          {isKeypadLayout ? (
            <Text style={styles.stepHintKeypad}>{stepHint}</Text>
          ) : stepHint ? (
            <Text style={styles.stepHint}>{stepHint}</Text>
          ) : null}
        </View>
        {isKeypadLayout ? (
          <View
            style={cardFit ? styles.bodyKeypadContentFit : styles.bodyKeypadContent}
          >
            {children}
          </View>
        ) : (
          children
        )}
      </View>
    </>
  );

  return (
    <KeyboardAvoidingView
      style={cardFit ? styles.rootFit : styles.root}
      behavior={
        isKeypadLayout ? undefined : Platform.OS === "ios" ? "padding" : undefined
      }
    >
      <View
        style={[
          cardFit ? styles.rootFit : styles.root,
          cardFit ? styles.shellColumnFit : styles.shellColumn,
          { paddingTop: insets.top },
        ]}
      >
        <View style={styles.topBar}>
          <Pressable
            style={styles.backBtn}
            onPress={currentIdx <= 0 ? onClose : onStepBack}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <ChevronLeft size={18} color={Theme.textPrimaryDark} strokeWidth={2.5} />
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

        {cardFit ? (
          <ScrollView
            style={styles.cardScroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {stepContent}
          </ScrollView>
        ) : (
          stepContent
        )}

        {!hideFooter ? (
          <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
            <Pressable
              style={[styles.fab, !canAdvance && styles.fabDisabled]}
              onPress={onAdvance}
              disabled={!canAdvance}
              accessibilityRole="button"
              accessibilityLabel={advanceLabel}
            >
              <ArrowRight size={18} color={Theme.textOnPrimary} strokeWidth={2.6} />
            </Pressable>
            <Text style={styles.footerHint}>{advanceLabel}</Text>
          </View>
        ) : null}
      </View>
    </KeyboardAvoidingView>
  );
});
