/**
 * Full-screen step-by-step party contact wizard (mobile / narrow web).
 * Step 1: import from contacts or enter manually → org → contact name → phone → review.
 */
import { memo, useCallback, useRef, type ReactNode } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInput as TextInputType,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { ArrowRight, BookUser, ChevronLeft, Smartphone } from "lucide-react-native";

import Theme from "@/constants/Theme";
import { IndiaFlagIcon } from "./IndiaFlagIcon";

export type PartyContactWizardFieldStep =
  | "source"
  | "organization"
  | "contact"
  | "phone";

const FIELD_STEPS: PartyContactWizardFieldStep[] = [
  "source",
  "organization",
  "contact",
  "phone",
];

export interface PartyContactMobileWizardProps {
  entityTitle: string;
  subtitle?: string;
  wizardStep: PartyContactWizardFieldStep;
  onWizardStepChange: (step: PartyContactWizardFieldStep) => void;
  onClose: () => void;

  orgLabel: string;
  orgValue: string;
  onOrgChange: (value: string) => void;
  orgOptional?: boolean;

  contactLabel: string;
  contactValue: string;
  onContactChange: (value: string) => void;

  phoneValue: string;
  onPhoneChange: (value: string) => void;
  phoneMaxLength?: number;

  importLoading: boolean;
  contactPickerAvailable: boolean;
  importError: string | null;
  onImportContacts: () => void;

  formError: string | null;
  noOrganizationBanner?: ReactNode;
  phoneStepExtras?: ReactNode;

  canAdvance: boolean;
  onAdvance: () => void;
  advanceLabel?: string;
}

function stepIndex(step: PartyContactWizardFieldStep): number {
  return FIELD_STEPS.indexOf(step);
}

export const PartyContactMobileWizard = memo(function PartyContactMobileWizard({
  entityTitle,
  subtitle = "Fill required fields and continue.",
  wizardStep,
  onWizardStepChange,
  onClose,
  orgLabel,
  orgValue,
  onOrgChange,
  orgOptional = true,
  contactLabel,
  contactValue,
  onContactChange,
  phoneValue,
  onPhoneChange,
  phoneMaxLength = 10,
  importLoading,
  contactPickerAvailable,
  importError,
  onImportContacts,
  formError,
  noOrganizationBanner,
  phoneStepExtras,
  canAdvance,
  onAdvance,
  advanceLabel = "Continue",
}: PartyContactMobileWizardProps) {
  const insets = useSafeAreaInsets();
  const orgRef = useRef<TextInputType>(null);
  const contactRef = useRef<TextInputType>(null);
  const phoneRef = useRef<TextInputType>(null);

  const handleBack = useCallback(() => {
    const idx = stepIndex(wizardStep);
    if (idx <= 0) {
      onClose();
      return;
    }
    onWizardStepChange(FIELD_STEPS[idx - 1]!);
  }, [wizardStep, onClose, onWizardStepChange]);

  const stepTitle = (() => {
    switch (wizardStep) {
      case "source":
        return "How do you want to add them?";
      case "organization":
        return orgOptional ? "Organization name" : orgLabel;
      case "contact":
        return contactLabel;
      case "phone":
        return "Mobile number";
      default:
        return entityTitle;
    }
  })();

  const stepHint = (() => {
    switch (wizardStep) {
      case "source":
        return "Import from your address book or type details step by step.";
      case "organization":
        return orgOptional
          ? "Optional — billing or company name on invoices."
          : "Required for this record.";
      case "contact":
        return "Primary person you coordinate with.";
      case "phone":
        return "10-digit Indian mobile. We can look up platform accounts.";
      default:
        return subtitle;
    }
  })();

  const currentIdx = stepIndex(wizardStep);

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <View style={styles.topBar}>
          <Pressable
            style={styles.backBtn}
            onPress={handleBack}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <ChevronLeft size={22} color="#0f172a" strokeWidth={2.5} />
          </Pressable>
          <View style={styles.progressRow}>
            {FIELD_STEPS.map((s, i) => (
              <View
                key={s}
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
          {wizardStep === "source" ? (
            <Text style={styles.subtitle}>{subtitle}</Text>
          ) : null}
        </View>

        {noOrganizationBanner}

        {formError ? (
          <View style={styles.errorBar}>
            <Text style={styles.errorText}>{formError}</Text>
          </View>
        ) : null}

        <View style={styles.body}>
          <Text style={styles.stepTitle}>{stepTitle}</Text>
          <Text style={styles.stepHint}>{stepHint}</Text>

          {wizardStep === "source" ? (
            <View style={styles.sourceBlock}>
              <Pressable
                style={[
                  styles.importPrimary,
                  (!contactPickerAvailable || importLoading) &&
                    styles.importPrimaryDim,
                ]}
                onPress={onImportContacts}
                disabled={importLoading}
              >
                {importLoading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <BookUser size={22} color="#fff" strokeWidth={2.2} />
                )}
                <Text style={styles.importPrimaryText}>
                  {importLoading ? "Opening contacts…" : "Import from contacts"}
                </Text>
              </Pressable>
              {importError ? (
                <Text style={styles.importError}>{importError}</Text>
              ) : !contactPickerAvailable ? (
                <Text style={styles.importHint}>
                  Contact import works in the native app. You can enter details
                  manually below.
                </Text>
              ) : null}
              <Pressable
                style={styles.manualLink}
                onPress={() => onWizardStepChange("organization")}
              >
                <Text style={styles.manualLinkText}>Enter details manually</Text>
                <ArrowRight size={16} color={Theme.primary} strokeWidth={2.5} />
              </Pressable>
            </View>
          ) : null}

          {wizardStep === "organization" ? (
            <View style={styles.fieldBlock}>
              <View style={styles.labelRow}>
                <Text style={styles.fieldLabel}>{orgLabel.toUpperCase()}</Text>
                {orgOptional ? (
                  <Text style={styles.optionalPill}>OPTIONAL</Text>
                ) : null}
              </View>
              <TextInput
                ref={orgRef}
                style={styles.input}
                placeholder="e.g. abc company"
                placeholderTextColor={Theme.textMuted}
                value={orgValue}
                onChangeText={onOrgChange}
                autoCapitalize="words"
                autoFocus
                testID="wizard-org-input"
              />
              {orgOptional ? (
                <Pressable
                  style={styles.skipLink}
                  onPress={() => onWizardStepChange("contact")}
                >
                  <Text style={styles.skipLinkText}>Skip for now</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          {wizardStep === "contact" ? (
            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>{contactLabel.toUpperCase()}</Text>
              <TextInput
                ref={contactRef}
                style={styles.input}
                placeholder="Full name"
                placeholderTextColor={Theme.textMuted}
                value={contactValue}
                onChangeText={onContactChange}
                autoCapitalize="words"
                autoFocus
                testID="wizard-contact-input"
              />
            </View>
          ) : null}

          {wizardStep === "phone" ? (
            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>PHONE</Text>
              <View style={styles.phoneRow}>
                <View style={styles.phoneCc}>
                  <IndiaFlagIcon width={20} height={15} />
                  <Text style={styles.phoneCcText}>+91</Text>
                </View>
                <TextInput
                  ref={phoneRef}
                  style={[styles.input, styles.phoneInput]}
                  placeholder="10-digit mobile"
                  placeholderTextColor={Theme.textMuted}
                  keyboardType="phone-pad"
                  maxLength={phoneMaxLength}
                  value={phoneValue}
                  onChangeText={onPhoneChange}
                  autoFocus
                  testID="wizard-phone-input"
                />
                <Smartphone size={18} color={Theme.textMuted} />
              </View>
              {phoneStepExtras}
            </View>
          ) : null}
        </View>

        {wizardStep !== "source" ? (
          <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
            <Pressable
              style={[
                styles.fab,
                !canAdvance && styles.fabDisabled,
              ]}
              onPress={onAdvance}
              disabled={!canAdvance}
              accessibilityRole="button"
              accessibilityLabel={advanceLabel}
              testID="wizard-continue-fab"
            >
              <ArrowRight size={22} color="#fff" strokeWidth={2.8} />
            </Pressable>
            <Text style={styles.footerHint}>{advanceLabel}</Text>
          </View>
        ) : null}
      </View>
    </KeyboardAvoidingView>
  );
});

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#fff",
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#f1f5f9",
    alignItems: "center",
    justifyContent: "center",
  },
  backBtnSpacer: {
    width: 40,
  },
  progressRow: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
  },
  progressDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#e2e8f0",
  },
  progressDotActive: {
    backgroundColor: Theme.positive,
    width: 24,
  },
  hero: {
    paddingHorizontal: 24,
    paddingBottom: 12,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Theme.positive,
  },
  entityTitle: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 2,
    color: Theme.positive,
    textTransform: "uppercase",
  },
  subtitle: {
    marginTop: 6,
    fontSize: 13,
    fontStyle: "italic",
    color: Theme.textMuted,
  },
  errorBar: {
    marginHorizontal: 20,
    marginBottom: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#fef2f2",
    borderWidth: 1,
    borderColor: "#fecaca",
  },
  errorText: {
    fontSize: 13,
    fontWeight: "600",
    color: Theme.negative,
  },
  body: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 8,
  },
  stepTitle: {
    fontSize: 28,
    fontWeight: "800",
    color: "#0f172a",
    letterSpacing: -0.5,
  },
  stepHint: {
    marginTop: 8,
    marginBottom: 24,
    fontSize: 14,
    lineHeight: 20,
    color: Theme.textMuted,
  },
  sourceBlock: {
    gap: 16,
  },
  importPrimary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    backgroundColor: Theme.primary,
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 20,
  },
  importPrimaryDim: {
    opacity: 0.65,
  },
  importPrimaryText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#fff",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  importError: {
    fontSize: 12,
    color: Theme.negative,
    fontWeight: "600",
  },
  importHint: {
    fontSize: 12,
    color: Theme.textMuted,
    lineHeight: 18,
  },
  manualLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 14,
  },
  manualLinkText: {
    fontSize: 14,
    fontWeight: "700",
    color: Theme.primary,
  },
  fieldBlock: {
    gap: 10,
  },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  fieldLabel: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
    color: Theme.textMuted,
  },
  optionalPill: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textMuted,
    letterSpacing: 0.6,
  },
  input: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === "web" ? 14 : 16,
    fontSize: 18,
    fontWeight: "600",
    color: "#0f172a",
    backgroundColor: "#f8fafc",
    ...Platform.select({
      web: { outlineStyle: "none" } as object,
    }),
  },
  skipLink: {
    alignSelf: "flex-start",
    paddingVertical: 8,
  },
  skipLinkText: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textMuted,
  },
  phoneRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 14,
    paddingHorizontal: 12,
    backgroundColor: "#f8fafc",
  },
  phoneCc: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingRight: 8,
    borderRightWidth: 1,
    borderRightColor: "#e2e8f0",
  },
  phoneCcText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0f172a",
  },
  phoneInput: {
    flex: 1,
    borderWidth: 0,
    backgroundColor: "transparent",
    paddingHorizontal: 0,
  },
  footer: {
    alignItems: "flex-end",
    paddingHorizontal: 24,
    paddingTop: 8,
    gap: 8,
  },
  fab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#0f172a",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
  fabDisabled: {
    opacity: 0.4,
  },
  footerHint: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginRight: 4,
  },
});

/** After contact import, jump to the first empty field or review-ready phone step. */
export function nextStepAfterContactImport(
  org: string,
  contact: string,
  phone: string,
): PartyContactWizardFieldStep {
  if (!org.trim()) return "organization";
  if (!contact.trim()) return "contact";
  if (!phone.trim()) return "phone";
  return "phone";
}
