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
import { SmartInputTrigger } from './SmartInputTrigger';
import { formatDisplayValue, toRawString, parseRawToNumber } from './keypad';
import type { TriggerVariant, TriggerValueColor } from './SmartInputTrigger';

export type SmartInputType = 'currency' | 'numeric' | 'percentage';

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

  /** Trigger layout variant */
  variant?: TriggerVariant;

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

  /**
   * Semantic coloring for the trigger value.
   * 'auto' → green for positive, red for negative.
   */
  valueColor?: TriggerValueColor | 'auto';

  disabled?: boolean;
  required?: boolean;
  errorMessage?: string;
}

export function SmartInput({
  type = 'currency',
  value,
  onChange,
  label,
  context,
  variant = 'row',
  placeholder,
  prefix,
  suffix,
  submitLabel = 'Apply',
  allowDecimal = true,
  valueColor = 'default',
  disabled = false,
  required = false,
  errorMessage,
}: SmartInputProps) {
  const [open, setOpen] = useState(false);

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

  // Effective prefix/suffix shown in the trigger
  const triggerPrefix = prefix !== undefined ? prefix : type === 'currency' ? '₹ ' : undefined;
  const triggerSuffix = suffix !== undefined ? suffix : type === 'percentage' ? '%' : undefined;

  const handleSubmit = useCallback(
    (raw: string) => {
      onChange(raw, parseRawToNumber(raw));
      setOpen(false);
    },
    [onChange],
  );

  return (
    <>
      <SmartInputTrigger
        label={label}
        displayValue={displayValue}
        placeholder={placeholder}
        onPress={() => setOpen(true)}
        disabled={disabled}
        prefix={triggerPrefix}
        suffix={triggerSuffix}
        valueColor={resolvedColor}
        variant={variant}
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
        type={type}
        prefix={prefix}
        suffix={suffix}
        placeholder={placeholder}
        allowDecimal={allowDecimal}
        submitLabel={submitLabel}
      />
    </>
  );
}
