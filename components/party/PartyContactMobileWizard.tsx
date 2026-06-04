/**
 * Full-screen step-by-step party contact wizard (mobile / narrow web).
 * Step 1: import from contacts or enter manually → org → contact name → phone → review.
 */
import { memo, useCallback, type ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { ArrowRight, BookUser } from "lucide-react-native";

import Theme from "@/constants/Theme";
import { PhoneNumberKeypadFlow } from "@/components/party/keypad/PhoneNumberKeypadFlow";
import { PartyMobileWizardShell } from "./PartyMobileWizardShell";
import { partyMobileWizardStyles as styles } from "./partyMobileWizardStyles";

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
  orgOptional = false,
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
  const isPhoneStep = wizardStep === "phone";

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
          : "Billing or company name used on invoices and records.";
      case "contact":
        return "Primary person you coordinate with.";
      case "phone":
        return "10-digit Indian mobile. We can look up platform accounts.";
      default:
        return subtitle;
    }
  })();

  const stepBody = (() => {
    switch (wizardStep) {
      case "source":
        return (
          <View style={styles.sourceCard}>
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
                  <ActivityIndicator color={Theme.textOnPrimary} />
                ) : (
                  <BookUser size={18} color={Theme.textOnPrimary} strokeWidth={2.2} />
                )}
                <Text style={styles.importPrimaryText}>
                  {importLoading ? "Opening contacts…" : "Import from contacts"}
                </Text>
              </Pressable>
              {importError ? (
                <Text style={styles.importError}>{importError}</Text>
              ) : !contactPickerAvailable ? (
                <Text style={styles.importHint}>
                  Contact import works in the native app. Enter details manually
                  below.
                </Text>
              ) : null}
              <View style={styles.sourceDivider} />
              <Pressable
                style={styles.manualLink}
                onPress={() => onWizardStepChange("organization")}
              >
                <Text style={styles.manualLinkText}>Enter details manually</Text>
                <ArrowRight size={14} color={Theme.primary} strokeWidth={2.5} />
              </Pressable>
            </View>
          </View>
        );
      case "organization":
        return (
          <View style={styles.fieldBlock}>
            <View style={styles.labelRow}>
              <Text style={styles.fieldLabel}>{orgLabel.toUpperCase()}</Text>
              {orgOptional ? (
                <Text style={styles.optionalPill}>OPTIONAL</Text>
              ) : null}
            </View>
            <TextInput
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
        );
      case "contact":
        return (
          <View style={styles.fieldBlock}>
            <Text style={styles.fieldLabel}>{contactLabel.toUpperCase()}</Text>
            <TextInput
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
        );
      case "phone":
        return (
          <PhoneNumberKeypadFlow
            value={phoneValue}
            onChangeText={onPhoneChange}
            maxLength={phoneMaxLength}
            label="PHONE"
            placeholder="10-digit mobile"
            error={Boolean(formError)}
            testID="wizard-phone-input"
            footerExtras={phoneStepExtras}
          />
        );
      default:
        return null;
    }
  })();

  return (
    <PartyMobileWizardShell
      entityTitle={entityTitle}
      subtitle={subtitle}
      stepIds={FIELD_STEPS}
      currentStep={wizardStep}
      onStepBack={handleBack}
      onClose={onClose}
      stepTitle={stepTitle}
      stepHint={stepHint}
      showEntitySubtitle={wizardStep === "source"}
      bodyLayout={isPhoneStep ? "keypad" : "default"}
      formError={formError}
      noOrganizationBanner={noOrganizationBanner}
      hideFooter={wizardStep === "source"}
      canAdvance={canAdvance}
      onAdvance={onAdvance}
      advanceLabel={advanceLabel}
    >
      {stepBody}
    </PartyMobileWizardShell>
  );
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
