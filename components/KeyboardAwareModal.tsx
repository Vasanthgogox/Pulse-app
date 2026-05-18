/**
 * Modal wrapper that keeps form content visible when the keyboard opens on Android.
 * Pattern: Modal → KeyboardAvoidingView (padding on both platforms) → [ScrollView] → children.
 *
 * Use for any RN Modal that contains TextInputs.
 *
 * On web, KeyboardAvoidingView is omitted — the viewport meta tag
 * (interactive-widget=overlays-content) handles keyboard overlay behaviour,
 * so no layout shifting is needed or desired.
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

  const inner = scroll ? (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={contentContainerStyle}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode={Platform.OS === 'web' ? 'none' : 'on-drag'}
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.inner, style]}>{children}</View>
  );

  return (
    <Modal
      visible={visible}
      animationType={animationType}
      presentationStyle={presentationStyle}
      onRequestClose={onRequestClose}
    >
      {Platform.OS === 'web' ? (
        <View style={[styles.wrapper, style]}>{inner}</View>
      ) : (
        <KeyboardAvoidingView
          style={[styles.wrapper, style]}
          behavior="padding"
          keyboardVerticalOffset={keyboardVerticalOffset}
        >
          {inner}
        </KeyboardAvoidingView>
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1 },
  scroll: { flex: 1 },
  inner: { flex: 1 },
});
