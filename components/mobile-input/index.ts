export { SmartInput } from './SmartInput';
export type { SmartInputProps, SmartInputType } from './SmartInput';

export { SmartInputTrigger } from './SmartInputTrigger';
export type { SmartInputTriggerProps, TriggerVariant, TriggerValueColor } from './SmartInputTrigger';

export { FullscreenNumericEntry } from './FullscreenNumericEntry';
export type { FullscreenNumericEntryProps } from './FullscreenNumericEntry';

export { DecimalKeypad } from './DecimalKeypad';
export { NumericDisplay } from './NumericDisplay';
export type { DisplayType } from './NumericDisplay';

export {
  applyKeypadPress,
  formatDisplayValue,
  toRawString,
  parseRawToNumber,
  rawToSubmitValue,
} from './keypad';
export type { KeypadKey } from './keypad';

export { useInputPlatform } from './useInputPlatform';
export type { InputPlatform } from './useInputPlatform';
