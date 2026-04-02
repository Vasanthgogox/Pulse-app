/**
 * Shared keyboard-avoiding constants so modals and forms behave consistently on Android.
 * See docs/ANDROID_KEYBOARD_ANALYSIS.md.
 */
import { Platform } from 'react-native';

/** Use for most modals and forms: content shifts with padding so focused input stays visible. */
export const KEYBOARD_AVOIDING_BEHAVIOR = Platform.OS === 'ios' ? 'padding' : 'padding';

/** Use for full-page modals (e.g. Add Transaction) where height-based resize works better. */
export const KEYBOARD_AVOIDING_BEHAVIOR_HEIGHT = Platform.OS === 'ios' ? 'padding' : 'height';
