// ─── Primary API ────────────────────────────────────────────────────────────
export { SmartInput } from './SmartInput';
export type { SmartInputProps, SmartInputType } from './SmartInput';

// ─── Trigger ─────────────────────────────────────────────────────────────────
export { SmartInputTrigger } from './SmartInputTrigger';
export type { SmartInputTriggerProps, TriggerVariant, TriggerValueColor } from './SmartInputTrigger';

// ─── Entry screen ────────────────────────────────────────────────────────────
export { FullscreenNumericEntry } from './FullscreenNumericEntry';
export type { FullscreenNumericEntryProps } from './FullscreenNumericEntry';

// ─── Party banner ────────────────────────────────────────────────────────────
export { NumericEntryPartyBanner } from './NumericEntryPartyBanner';
export type { NumericEntryPartyPreview } from './NumericEntryPartyBanner';

// ─── Primitives ──────────────────────────────────────────────────────────────
export { DecimalKeypad } from './DecimalKeypad';
export { NumericDisplay } from './NumericDisplay';
export type { DisplayType } from './NumericDisplay';

// ─── Formatters ──────────────────────────────────────────────────────────────
export {
  formatEntryDisplay,
  formatTriggerDisplay,
  formatINRDisplay,
  formatPercentageDisplay,
  formatWeightDisplay,
  formatDistanceDisplay,
  getDefaultPrefix,
  getDefaultSuffix,
} from './formatters';

// ─── Validation ──────────────────────────────────────────────────────────────
export { validateEntry, isSubmittable, resolveValidationRule, SMART_INPUT_AMOUNT_MAX } from './validation';

// ─── Keypad engine ───────────────────────────────────────────────────────────
export {
  applyKeypadPress,
  formatDisplayValue,
  toRawString,
  parseRawToNumber,
  rawToSubmitValue,
  isKeypadValueSubmittable,
} from './keypad';
export type { KeypadKey, KeypadOptions } from './keypad';

// ─── Feedback ────────────────────────────────────────────────────────────────
export { triggerFeedback } from './feedback';

// ─── Types ───────────────────────────────────────────────────────────────────
export type {
  SmartInputType as SmartInputTypeExtended,
  SmartInputVariant,
  DesktopInputMode,
  InputPlatform,
  NumericFormatOptions,
  ValidationRule,
  ValidationResult,
  EntryContext,
  FeedbackEvent,
  KeypadKey as KeypadKeyType,
} from './types';

// ─── Platform hook ───────────────────────────────────────────────────────────
export { useInputPlatform } from './useInputPlatform';
