/**
 * Centered pay-style numeric entry for wizard shells — matches FullscreenNumericEntry
 * mobile layout with attribution wizard typography (small labels, docked keypad).
 */
import { memo, useCallback, useMemo } from "react";
import { Pressable, Text, useWindowDimensions, View } from "react-native";

import { DecimalKeypad } from "@/components/mobile-input/DecimalKeypad";
import type { NumericEntryPartyPreview } from "@/components/mobile-input/NumericEntryPartyBanner";
import { NumericDisplay } from "@/components/mobile-input/NumericDisplay";
import {
  applyKeypadPress,
  type KeypadKey,
} from "@/components/mobile-input/keypad";
import { partyKeypadFlowStyles as flow } from "@/components/party/keypad/partyKeypadFlowStyles";
import Layout from "@/constants/Layout";

import { fullPageWizardStyles as styles } from "./fullPageWizardStyles";
import { WizardEntityPartyCell } from "./WizardEntityPartyCell";

export type WizardNumericKeypadField = {
  id: string;
  /** Centered title above amount (e.g. "Client sale price"). */
  label: string;
  rawValue: string;
  onRawValueChange: (raw: string) => void;
  optional?: boolean;
  errorMessage?: string;
};

export type WizardNumericKeypadFlowProps = {
  fields: WizardNumericKeypadField[];
  activeFieldId?: string;
  onActiveFieldChange?: (id: string) => void;
  partyPreview?: NumericEntryPartyPreview;
  /** Secondary line under title (attribution subtitle scale). */
  hint?: string;
  showDecimal?: boolean;
  prefix?: string;
  placeholder?: string;
};

function KeypadDock({ onKey, showDecimal }: { onKey: (key: KeypadKey) => void; showDecimal: boolean }) {
  return (
    <DecimalKeypad
      onKey={onKey}
      showDecimal={showDecimal}
      variant="pay"
      size="compact"
    />
  );
}

export const WizardNumericKeypadFlow = memo(function WizardNumericKeypadFlow({
  fields,
  activeFieldId,
  onActiveFieldChange,
  partyPreview,
  hint,
  showDecimal = true,
  prefix = "₹",
  placeholder = "0",
}: WizardNumericKeypadFlowProps) {
  const { width } = useWindowDimensions();
  const isDesktopKeypad = width >= Layout.wizardSteppedMaxWidth;

  const resolvedActiveId = activeFieldId ?? fields[0]?.id ?? "";
  const activeField =
    fields.find((field) => field.id === resolvedActiveId) ?? fields[0] ?? null;

  const showFieldSwitch = fields.length > 1 && onActiveFieldChange != null;

  const handleKey = useCallback(
    (key: KeypadKey) => {
      if (!activeField) return;
      activeField.onRawValueChange(
        applyKeypadPress(activeField.rawValue, key, { maxDecimalPlaces: 2 }),
      );
    },
    [activeField],
  );

  const partyCell = useMemo(() => {
    if (!partyPreview) return null;
    return (
      <WizardEntityPartyCell
        label={
          partyPreview.entityType === "supplier"
            ? "Partner"
            : partyPreview.entityType === "driver"
              ? "Driver"
              : "Client"
        }
        name={partyPreview.name}
        subtitle={partyPreview.subtitle}
        entityType={partyPreview.entityType ?? "client"}
        avatarUrl={partyPreview.avatarUrl}
        avatarSeed={partyPreview.avatarSeed}
        organizationImageUrl={partyPreview.organizationImageUrl}
        organizationAvatarSeed={partyPreview.organizationAvatarSeed}
      />
    );
  }, [partyPreview]);

  if (!activeField) return null;

  const amountPane = (
    <>
      {partyCell ? (
        <View style={[styles.wizardKeypadPartyWrap, isDesktopKeypad && { alignSelf: "stretch" }]}>
          {partyCell}
        </View>
      ) : null}

      {showFieldSwitch ? (
        <View style={[styles.modeRow, styles.wizardKeypadFieldSwitch]}>
          {fields.map((field) => {
            const selected = field.id === activeField.id;
            return (
              <Pressable
                key={field.id}
                style={[styles.modeChip, selected && styles.modeChipActive]}
                onPress={() => onActiveFieldChange?.(field.id)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
              >
                <Text
                  style={[
                    styles.modeChipText,
                    selected && styles.modeChipTextActive,
                  ]}
                  numberOfLines={1}
                >
                  {field.label}
                  {field.optional ? " (opt.)" : ""}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      <View style={styles.wizardKeypadLabelBlock}>
        <Text style={styles.wizardKeypadTitle}>
          {activeField.label}
          {!showFieldSwitch && activeField.optional ? " (optional)" : ""}
        </Text>
        {hint ? <Text style={styles.wizardKeypadHint}>{hint}</Text> : null}
      </View>

      <NumericDisplay
        rawValue={activeField.rawValue}
        type="currency"
        prefix={prefix}
        placeholder={placeholder}
        variant="wizard"
      />

      {activeField.errorMessage ? (
        <Text style={styles.wizardKeypadError} accessibilityRole="alert">
          {activeField.errorMessage}
        </Text>
      ) : null}
    </>
  );

  if (isDesktopKeypad) {
    return (
      <View style={styles.wizardKeypadRoot}>
        <View style={styles.wizardKeypadDesktopRow}>
          <View style={styles.wizardKeypadAmountPane}>{amountPane}</View>
          <View style={styles.wizardKeypadKeysPane}>
            <View style={styles.wizardKeypadKeysCard}>
              <KeypadDock onKey={handleKey} showDecimal={showDecimal} />
            </View>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.wizardKeypadRoot}>
      <View style={styles.wizardKeypadBody}>{amountPane}</View>
      <View style={flow.keypadDockWizard}>
        <KeypadDock onKey={handleKey} showDecimal={showDecimal} />
      </View>
    </View>
  );
});
