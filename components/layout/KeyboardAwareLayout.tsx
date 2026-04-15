/**
 * Global keyboard-aware layout: KeyboardAvoidingView + optional ScrollView.
 * Use for full-screen forms or as the scrollable body inside modals so that
 * on Android the keyboard does not hide inputs (behavior is set for both platforms).
 *
 * Aligns with docs/ANDROID_KEYBOARD_ANALYSIS.md.
 */
import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  type ViewStyle,
} from 'react-native';

/** Same behavior on both platforms so Android modals shift content when keyboard opens. */
const KEYBOARD_BEHAVIOR = Platform.OS === 'ios' ? 'padding' : 'padding';

export interface KeyboardAwareLayoutProps {
  children: ReactNode;
  /** Offset for header/nav (e.g. insets.top + 16). */
  keyboardVerticalOffset?: number;
  style?: ViewStyle;
  contentContainerStyle?: ViewStyle;
  /** Set to false when the child is already a ScrollView. */
  scroll?: boolean;
}

export function KeyboardAwareLayout({
  children,
  keyboardVerticalOffset = 0,
  style,
  contentContainerStyle,
  scroll = true,
}: KeyboardAwareLayoutProps) {
  return (
    <KeyboardAvoidingView
      style={[styles.wrapper, style]}
      behavior={KEYBOARD_BEHAVIOR}
      keyboardVerticalOffset={keyboardVerticalOffset}
    >
      {scroll ? (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={contentContainerStyle}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      ) : (
        children
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1 },
  scroll: { flex: 1 },
});
