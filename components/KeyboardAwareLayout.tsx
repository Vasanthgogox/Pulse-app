/**
 * Global keyboard-aware layout: KeyboardAvoidingView + optional ScrollView.
 * Use for full-screen forms or as the scrollable body inside modals so that
 * on Android the keyboard does not hide inputs (behavior is set for both platforms).
 *
 * For `decimal-pad` / `number-pad` fields, wire `useKeyboardAccessoryField` from
 * `@/contexts/KeyboardAccessoryContext` (Done / Next bar is mounted in app root).
 *
 * On web the virtual keyboard is handled by the viewport meta tag
 * (interactive-widget=overlays-content in app/+html.tsx), so KeyboardAvoidingView
 * is bypassed — it would try to shift layout based on a keyboard height that the
 * browser never reports through the RN Keyboard API, producing incorrect padding.
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
