/**
 * Modal wrapper that keeps form content visible when the keyboard opens on Android.
 * Pattern: Modal → KeyboardAvoidingView (padding on both platforms) → [ScrollView] → children.
 *
 * Use for any RN Modal that contains TextInputs. Aligns with docs/ANDROID_KEYBOARD_ANALYSIS.md.
 */
import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  View,
  StyleSheet,
  type ViewStyle,
} from 'react-native';

const KEYBOARD_BEHAVIOR = Platform.OS === 'ios' ? 'padding' : 'padding';

export interface KeyboardAwareModalProps {
  visible: boolean;
  onRequestClose: () => void;
  children: ReactNode;
  keyboardVerticalOffset?: number;
  animationType?: 'none' | 'slide' | 'fade';
  presentationStyle?: 'pageSheet' | 'fullScreen' | 'formSheet' | 'overFullScreen';
  /** If true, content is wrapped in ScrollView with keyboardShouldPersistTaps (default true for forms). */
  scroll?: boolean;
  style?: ViewStyle;
  contentContainerStyle?: ViewStyle;
}

export function KeyboardAwareModal({
  visible,
  onRequestClose,
  children,
  keyboardVerticalOffset = 0,
  animationType = 'slide',
  presentationStyle = 'pageSheet',
  scroll = true,
  style,
  contentContainerStyle,
}: KeyboardAwareModalProps) {
  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      animationType={animationType}
      presentationStyle={presentationStyle}
      onRequestClose={onRequestClose}
    >
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
          <View style={[styles.inner, style]}>{children}</View>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1 },
  scroll: { flex: 1 },
  inner: { flex: 1 },
});
