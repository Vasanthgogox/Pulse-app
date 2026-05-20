/**
 * Global keyboard-aware layout: KeyboardAvoidingView + optional ScrollView.
 * Use for full-screen forms or as the scrollable body inside modals so that
 * on Android the keyboard does not hide inputs (behavior is set for both platforms).
 *
 * For `decimal-pad` / `number-pad` fields, wire `useKeyboardAccessoryField` from
 * `@/contexts/KeyboardAccessoryContext` (Done / Next bar is mounted in app root).
 *
 * On web, KeyboardAvoidingView is bypassed (RN Keyboard does not fire on mobile
 * browsers). Bottom-docked inputs (chat, ops agent) use `useKeyboardVisible()` +
 * visualViewport inset; forms in scroll views rely on the same hook or manual inset.
 * See app/+html.tsx `interactive-widget=overlays-content`.
 */
import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';

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
  if (Platform.OS === 'web') {
    return scroll ? (
      <ScrollView
        style={[styles.scroll, style]}
        contentContainerStyle={contentContainerStyle}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
    ) : (
      <View style={[styles.wrapper, style]}>{children}</View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.wrapper, style]}
      behavior="padding"
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
