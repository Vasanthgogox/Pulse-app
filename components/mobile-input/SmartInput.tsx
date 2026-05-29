/**
 * SmartInput — universal financial / numeric input component.
 *
 * Renders a tappable trigger field. On tap, opens a focused full-screen
 * entry experience (mobile) or a right-side drawer (desktop) with a
 * custom decimal keypad — no native keyboard for financial inputs.
 *
 * Usage:
 *   <SmartInput
 *     type="currency"
 *     label="Supplier Cost"
 *     context="Trip: BLR → CHN · XYZ Transport"
 *     value={supplierCost}
 *     onChange={(raw, numeric) => setSupplierCost(numeric)}
 *   />
 */
import React, { useState, useCallback, useMemo } from 'react';
import { FullscreenNumericEntry } from './FullscreenNumericEntry';
import type { NumericEntryPartyPreview } from './NumericEntryPartyBanner';
import { SmartInputTrigger } from './SmartInputTrigger';
import { formatDisplayValue, toRawString, parseRawToNumber } from './keypad';
import { validateEntry, resolveValidationRule } from './validation';
import { triggerFeedback } from './feedback';
import type { TriggerDensity, TriggerVariant, TriggerValueColor } from './SmartInputTrigger';
import type { ValidationRule, SmartInputType } from './types';

export type { SmartInputType };

export interface SmartInputProps {
  /** Semantic type — drives prefix/suffix defaults and display formatting */
  type?: SmartInputType;

  /** Current value as number or raw string. Pass undefined / 0 for empty state. */
  value?: number | string;

  /**
   * Called when the user applies a new value.
   * @param raw     The raw digit string ("45000", "7.5")
   * @param numeric Parsed JS number (safe for display math, use raw for DB writes)
   */
  onChange: (raw: string, numeric: number) => void;

  /** Displayed in the trigger row and as the entry header */
  label: string;

  /** Secondary line in the entry header, e.g. "Trip: BLR → CHN" */
  context?: string;

  /** Party row (avatar + name) on the numeric entry screen. */
  partyPreview?: NumericEntryPartyPreview;

  /** Trigger layout variant */
  variant?: TriggerVariant;

  /** Compact trigger typography for dense operational forms */
  density?: TriggerDensity;

  /** Hero trigger accent (currency prefix colour). */
  heroAccentColor?: string;

  /** Placeholder shown when value is empty */
  placeholder?: string;

  /** Override auto prefix (currency → '₹'). Pass '' to suppress. */
  prefix?: string;

  /** Override auto suffix (percentage → '%'). Pass '' to suppress. */
  suffix?: string;

  /** Button label inside the entry screen */
  submitLabel?: string;

  /** Allow decimal input (default true) */
  allowDecimal?: boolean;

  /** Maximum decimal places (0-2). Overrides allowDecimal=false. */
  maxDecimalPlaces?: 0 | 1 | 2;

  /** Validation rules applied before onChange fires. */
  validation?: ValidationRule;

  /**
   * Semantic coloring for the trigger value.
   * 'auto' → green for positive, red for negative.
   */
  valueColor?: TriggerValueColor | 'auto';

  disabled?: boolean;
  required?: boolean;
  /** External error from form validation (shown below the trigger). */
  errorMessage?: string;
}

export function SmartInput({
  type = 'currency',
  value,
  onChange,
  label,
  context,
  partyPreview,
  variant = 'row',
  density = 'default',
  placeholder,
  prefix,
  suffix,
  submitLabel = 'Apply',
  allowDecimal = true,
  maxDecimalPlaces,
  validation,
  valueColor = 'default',
  heroAccentColor,
  disabled = false,
  required = false,
  errorMessage,
}: SmartInputProps) {
  const [open, setOpen] = useState(false);
  const [entryError, setEntryError] = useState<string | undefined>();

  // Strip commas and normalise to raw digit string for the entry screen
  const rawInitial = useMemo(() => toRawString(value), [value]);

  // Formatted value for the trigger chip
  const displayValue = useMemo(() => {
    const raw = toRawString(value);
    if (!raw) return '';
    return formatDisplayValue(raw, type);
  }, [value, type]);

  // Resolve 'auto' colour
  const resolvedColor = useMemo((): TriggerValueColor => {
    if (valueColor !== 'auto') return valueColor;
    const n = parseRawToNumber(toRawString(value));
    return n > 0 ? 'positive' : n < 0 ? 'negative' : 'default';
  }, [valueColor, value]);

  // Merge required + allowDecimal + explicit validation into a single rule
  const resolvedRule = useMemo(
    () => resolveValidationRule({ required, allowDecimal, maxDecimalPlaces, validation }),
    [required, allowDecimal, maxDecimalPlaces, validation],
  );

  // Effective prefix/suffix shown in the trigger
  const triggerPrefix = prefix !== undefined ? prefix : type === 'currency' ? '₹ ' : undefined;
  const triggerSuffix = suffix !== undefined ? suffix : type === 'percentage' ? '%' : undefined;

  const handleSubmit = useCallback(
    (raw: string) => {
      const numeric = parseRawToNumber(raw);
      const result = validateEntry(raw, resolvedRule, numeric);
      if (!result.valid) {
        setEntryError(result.errorMessage);
        triggerFeedback('error');
        return;
      }
      setEntryError(undefined);
      onChange(raw, numeric);
      setOpen(false);
    },
    [onChange, resolvedRule],
  );

  const handleOpen = useCallback(() => {
    if (disabled) return;
    setEntryError(undefined);
    setOpen(true);
  }, [disabled]);

  return (
    <>
      <SmartInputTrigger
        label={label}
        displayValue={displayValue}
        placeholder={placeholder}
        onPress={handleOpen}
        disabled={disabled}
        prefix={triggerPrefix}
        suffix={triggerSuffix}
        valueColor={resolvedColor}
        variant={variant}
        density={density}
        heroAccentColor={heroAccentColor}
        required={required}
        errorMessage={errorMessage}
      />

      <FullscreenNumericEntry
        visible={open}
        onClose={() => setOpen(false)}
        onSubmit={handleSubmit}
        initialValue={rawInitial}
        label={label}
        contextLine={context}
        partyPreview={partyPreview}
        type={type}
        prefix={prefix}
        suffix={suffix}
        placeholder={placeholder}
        allowDecimal={allowDecimal}
        maxDecimalPlaces={maxDecimalPlaces}
        submitLabel={submitLabel}
        validationError={entryError}
      />
    </>
  );
}
