/**
 * Google Pay payout–style centered numeric entry for wizard shells.
 * Shared by Client sale price and Partner rate so both look identical.
 *
 * Layout (mobile): centered recipient (avatar → name → phone) → optional field
 * switch → title/hint → hero amount → keypad — matches GPay “Paying …” screen.
 */
import { memo, useCallback, useEffect, useMemo, type ReactNode } from "react";
import { Platform, Pressable, Text, useWindowDimensions, View } from "react-native";

import { DecimalKeypad } from "@/components/mobile-input/DecimalKeypad";
import type { NumericEntryPartyPreview } from "@/components/mobile-input/NumericEntryPartyBanner";
import { NumericDisplay } from "@/components/mobile-input/NumericDisplay";
import { NumericEntryRecipientHero } from "@/components/mobile-input/NumericEntryRecipientHero";
import {
  applyKeypadPress,
  type KeypadKey,
} from "@/components/mobile-input/keypad";
import { partyKeypadFlowStyles as flow } from "@/components/party/keypad/partyKeypadFlowStyles";
import Layout from "@/constants/Layout";

import { WizardActionBarHost } from "./WizardActionBarContext";
import { fullPageWizardStyles as styles } from "./fullPageWizardStyles";
import { WizardEntityPartyCell } from "./WizardEntityPartyCell";

export type WizardNumericKeypadField = {
  id: string;
  /** Centered title above amount (e.g. "Client sale price"). */
  label: string;
  /** Short label for segmented switch (defaults to label). */
  switchLabel?: string;
  /** Field-specific hint; falls back to flow-level `hint`. */
  hint?: string;
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
  /** Tap recipient (e.g. change partner). */
  onPartyPress?: () => void;
  /** Secondary line under title when a field has no own hint. */
  hint?: string;
  showDecimal?: boolean;
  prefix?: string;
  placeholder?: string;
  /** Optional content between amount and keypad. */
  accessory?: ReactNode;
  /**
   * Always use the mobile GPay layout (centered recipient + hero amount + keypad),
   * even on wide viewports — e.g. desktop partner-rate popup.
   */
  forceMobileLayout?: boolean;
  /** Tighter type + spacing for desktop popup sheets. */
  compact?: boolean;
};

function KeypadDock({
  onKey,
  showDecimal,
  size = "default",
  layout,
}: {
  onKey: (key: KeypadKey) => void;
  showDecimal: boolean;
  size?: "default" | "compact";
  layout?: "decimal" | "phone";
}) {
  return (
    <DecimalKeypad
      onKey={onKey}
      showDecimal={showDecimal}
      variant="pay"
      size={size}
      layout={layout ?? (showDecimal ? "decimal" : "phone")}
      hapticsEnabled={false}
    />
  );
}

export const WizardNumericKeypadFlow = memo(function WizardNumericKeypadFlow({
  fields,
  activeFieldId,
  onActiveFieldChange,
  partyPreview,
  onPartyPress,
  hint,
  showDecimal = true,
  prefix = "₹",
  placeholder = "0",
  accessory,
  forceMobileLayout = false,
  compact = false,
}: WizardNumericKeypadFlowProps) {
  const { width } = useWindowDimensions();
  const isDesktopKeypad =
    !forceMobileLayout && width >= Layout.wizardSteppedMaxWidth;
  /** Mobile + desktop popup — same pay tray chrome as driver sign-in. */
  const matchSignInKeypad = forceMobileLayout || !isDesktopKeypad;

  const resolvedActiveId = activeFieldId ?? fields[0]?.id ?? "";
  const activeField =
    fields.find((field) => field.id === resolvedActiveId) ?? fields[0] ?? null;

  const showFieldSwitch = fields.length > 1 && onActiveFieldChange != null;
  const activeHint = activeField?.hint ?? hint;

  const handleKey = useCallback(
    (key: KeypadKey) => {
      if (!activeField) return;
      activeField.onRawValueChange(
        applyKeypadPress(activeField.rawValue, key, { maxDecimalPlaces: 2 }),
      );
    },
    [activeField],
  );

  // Web: physical keyboard mirrors the on-screen keypad (desktop popup + web mobile).
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || target?.isContentEditable) {
        return;
      }
      let mapped: KeypadKey | null = null;
      if (e.key >= "0" && e.key <= "9") mapped = e.key as KeypadKey;
      else if (e.key === "." || e.key === ",") mapped = ".";
      else if (e.key === "Backspace" || e.key === "Delete") mapped = "⌫";
      if (!mapped) return;
      e.preventDefault();
      handleKey(mapped);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleKey]);

  const partyRoleLabel =
    partyPreview?.entityType === "supplier"
      ? "Partner"
      : partyPreview?.entityType === "driver"
        ? "Driver"
        : "Client";

  /** GPay: “Paying {name}” / “Billing {name}” above the amount. */
  const recipientCaption =
    partyPreview?.entityType === "supplier"
      ? "Paying"
      : partyPreview
        ? "Billing"
        : undefined;

  // Mobile always uses compact type so the shell footer stays on-screen.
  const useCompactChrome = compact || !isDesktopKeypad;

  const recipientHero = useMemo(() => {
    if (!partyPreview) return null;
    return (
      <NumericEntryRecipientHero
        party={partyPreview}
        caption={recipientCaption}
        nameInline={Boolean(recipientCaption)}
        compact
        dense={useCompactChrome}
        onPress={onPartyPress}
      />
    );
  }, [onPartyPress, partyPreview, recipientCaption, useCompactChrome]);

  /** Desktop keeps compact party row inside the card chrome. */
  const desktopPartyCell = useMemo(() => {
    if (!partyPreview) return null;
    return (
      <WizardEntityPartyCell
        label={partyRoleLabel}
        name={partyPreview.name}
        subtitle={partyPreview.subtitle}
        entityType={partyPreview.entityType ?? "client"}
        avatarUrl={partyPreview.avatarUrl}
        avatarSeed={partyPreview.avatarSeed}
        organizationImageUrl={partyPreview.organizationImageUrl}
        organizationAvatarSeed={partyPreview.organizationAvatarSeed}
        avatarSize={40}
        onPress={onPartyPress}
        showChevron={Boolean(onPartyPress)}
        style={styles.wizardKeypadPartyCard}
      />
    );
  }, [onPartyPress, partyPreview, partyRoleLabel]);

  if (!activeField) return null;

  const fieldSwitch = showFieldSwitch ? (
    <View
      style={[
        styles.modeRow,
        styles.wizardKeypadFieldSwitch,
        compact && styles.wizardKeypadFieldSwitchCompact,
      ]}
    >
      {fields.map((field) => {
        const selected = field.id === activeField.id;
        const chipLabel =
          field.switchLabel ??
          (field.optional ? `${field.label} (opt.)` : field.label);
        return (
          <Pressable
            key={field.id}
            style={[
              styles.modeChip,
              compact && styles.modeChipCompact,
              selected && styles.modeChipActive,
            ]}
            onPress={() => onActiveFieldChange?.(field.id)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
          >
            <Text
              style={[
                styles.modeChipText,
                compact && styles.modeChipTextCompact,
                selected && styles.modeChipTextActive,
              ]}
              numberOfLines={1}
            >
              {chipLabel}
            </Text>
          </Pressable>
        );
      })}
    </View>
  ) : null;

  // Field switch / modal chrome already name the field — skip duplicate title.
  const showLabelBlock = !showFieldSwitch && !useCompactChrome;
  const showCompactFieldTitle = useCompactChrome && !showFieldSwitch;
  const showHintUnderAmount = Boolean(activeHint) && !useCompactChrome;

  const payoutStage = (
    <View
      style={[
        styles.wizardKeypadPayoutStage,
        useCompactChrome && styles.wizardKeypadPayoutStageCompact,
      ]}
    >
      {showLabelBlock ? (
        <View style={styles.wizardKeypadLabelBlock}>
          <Text
            style={[
              styles.wizardKeypadTitle,
              useCompactChrome && styles.wizardKeypadTitleCompact,
            ]}
          >
            {activeField.label}
            {activeField.optional ? " (optional)" : ""}
          </Text>
          {activeHint && !useCompactChrome ? (
            <Text style={styles.wizardKeypadHint}>{activeHint}</Text>
          ) : null}
        </View>
      ) : showCompactFieldTitle ? (
        <Text style={styles.wizardKeypadTitleCompact} numberOfLines={1}>
          {activeField.label}
          {activeField.optional ? " (optional)" : ""}
        </Text>
      ) : null}
      <NumericDisplay
        rawValue={activeField.rawValue}
        type="currency"
        prefix={prefix}
        placeholder={placeholder}
        variant={useCompactChrome ? "wizardCompact" : "hero"}
      />
      {activeField.errorMessage ? (
        <Text style={styles.wizardKeypadError} accessibilityRole="alert">
          {activeField.errorMessage}
        </Text>
      ) : showHintUnderAmount && showFieldSwitch ? (
        <Text style={styles.wizardKeypadHintMuted}>{activeHint}</Text>
      ) : (
        <View style={styles.wizardKeypadErrorSpacer} />
      )}
    </View>
  );

  if (isDesktopKeypad) {
    return (
      <View style={styles.wizardKeypadRoot}>
        <View style={styles.wizardKeypadDesktopCenter}>
          <View style={styles.wizardKeypadDesktopCard}>
            {desktopPartyCell ? (
              <View style={styles.wizardKeypadPartyInCard}>{desktopPartyCell}</View>
            ) : null}
            {fieldSwitch ? (
              <View style={styles.wizardKeypadDesktopSwitch}>{fieldSwitch}</View>
            ) : null}
            <View style={styles.wizardKeypadDesktopRow}>
              <View style={styles.wizardKeypadAmountPane}>{payoutStage}</View>
              <View style={styles.wizardKeypadKeysPane}>
                <View style={styles.wizardKeypadKeysCard}>
                  <KeypadDock
                    onKey={handleKey}
                    showDecimal={showDecimal}
                    size="default"
                  />
                </View>
              </View>
            </View>
          </View>
          {/* Tablet/desktop keypad: the shell hoists its footer into context, so
           *  this host must render or Continue disappears entirely (iPad). */}
          <WizardActionBarHost style={styles.wizardKeypadDesktopActionBar} />
        </View>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.wizardKeypadRoot,
        matchSignInKeypad && styles.wizardKeypadRootPopup,
      ]}
    >
      <View
        style={[
          styles.wizardKeypadBody,
          styles.wizardKeypadBodyMobilePay,
          useCompactChrome && styles.wizardKeypadBodyCompact,
          matchSignInKeypad && styles.wizardKeypadBodyPopup,
        ]}
      >
        {recipientHero ? (
          <View style={styles.wizardKeypadRecipientWrap}>{recipientHero}</View>
        ) : null}
        {fieldSwitch}
        {payoutStage}
      </View>
      {accessory ? (
        <View
          style={[
            styles.wizardKeypadAccessory,
            matchSignInKeypad && styles.wizardKeypadAccessoryPopup,
          ]}
        >
          {accessory}
        </View>
      ) : null}
      {/* Continue / Close — hosted above the pad so CTAs never sit under keys. */}
      <WizardActionBarHost style={styles.wizardKeypadActionBar} />
      <View
        style={[
          flow.keypadDockWizard,
          flow.keypadDockWizardBleed,
          flow.keypadDockSignIn,
        ]}
      >
        <KeypadDock
          onKey={handleKey}
          showDecimal={showDecimal}
          size="default"
        />
      </View>
    </View>
  );
});
