import Theme from '@/constants/Theme';
import { tGlobal } from '@/contexts/LanguageContext';
import { registerConfirmDialogImplementation } from '@/lib/confirmDialog';
import { platformShadow } from '@/lib/platformShadow';
import { pe } from '@/lib/platformViewStyle.util';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';

export interface ConfirmDialogRequest {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

/**
 * Single themed confirm modal for `confirmDialog()`, styled to match
 * AppAlertHost but with a real two-button choice (Cancel / Confirm) that
 * actually resolves on every platform — including web, where a bare
 * `Alert.alert` with multiple buttons has no native dialog to back it and
 * silently never invokes its callbacks.
 */
export function ConfirmDialogHost() {
  const { width } = useWindowDimensions();
  const isCompact = width < 420;

  const [visible, setVisible] = useState(false);
  const [request, setRequest] = useState<ConfirmDialogRequest | null>(null);
  const resolveRef = useRef<((value: boolean) => void) | null>(null);

  const show = useCallback((req: ConfirmDialogRequest) => {
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
      setRequest(req);
      setVisible(true);
    });
  }, []);

  const settle = useCallback((value: boolean) => {
    setVisible(false);
    resolveRef.current?.(value);
    resolveRef.current = null;
  }, []);

  useEffect(() => {
    registerConfirmDialogImplementation(show);
    return () => registerConfirmDialogImplementation(null);
  }, [show]);

  if (!request) return null;

  const {
    title,
    message,
    confirmLabel = tGlobal('confirm'),
    cancelLabel = tGlobal('cancel'),
    destructive = false,
  } = request;

  const accent = destructive ? Theme.destructive : Theme.modalNeutralAccent;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => settle(false)}
    >
      <View style={[styles.backdrop, pe('box-none')]}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={() => settle(false)}
          accessibilityRole="button"
          accessibilityLabel={cancelLabel}
        />
        <View
          style={[styles.card, isCompact && styles.cardCompact]}
          accessibilityRole="alert"
          accessibilityViewIsModal
        >
          <View
            style={[
              styles.iconWrap,
              destructive && { backgroundColor: 'rgba(232,33,39,0.10)' },
            ]}
          >
            <Text style={[styles.iconChar, { color: accent }]}>
              {destructive ? '!' : '?'}
            </Text>
          </View>
          <Text style={styles.title}>{title}</Text>
          {message ? <Text style={styles.body}>{message}</Text> : null}

          <View style={styles.actionRow}>
            <Pressable
              onPress={() => settle(false)}
              style={({ pressed }) => [
                styles.button,
                styles.buttonNeutral,
                pressed && styles.buttonPressed,
              ]}
              accessibilityRole="button"
            >
              <Text style={styles.buttonNeutralLabel}>{cancelLabel}</Text>
            </Pressable>
            <Pressable
              onPress={() => settle(true)}
              style={({ pressed }) => [
                styles.button,
                { backgroundColor: accent },
                pressed && styles.buttonPressed,
              ]}
              accessibilityRole="button"
            >
              <Text style={styles.buttonLabel}>{confirmLabel}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.58)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 24,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.networkPageBackground,
    paddingHorizontal: 22,
    paddingTop: 26,
    paddingBottom: 20,
    alignItems: 'stretch',
    ...platformShadow('0 16px 28px rgba(15, 23, 42, 0.18)', {
      color: Theme.shadow,
      opacity: 0.18,
      radius: 28,
      offsetY: 16,
      elevation: 8,
    }),
  },
  cardCompact: {
    borderRadius: 24,
    paddingHorizontal: 18,
  },
  iconWrap: {
    alignSelf: 'center',
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Theme.modalNeutralIconWash,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: Theme.textPrimaryDark,
    textAlign: 'center',
    letterSpacing: -0.2,
  },
  body: {
    marginTop: 10,
    fontSize: 15,
    fontWeight: '500',
    color: Theme.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  actionRow: {
    marginTop: 22,
    flexDirection: 'row',
    gap: 10,
  },
  button: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 14,
  },
  buttonNeutral: {
    backgroundColor: Theme.surfaceGray,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  buttonPressed: {
    opacity: 0.88,
  },
  buttonLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
  buttonNeutralLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: Theme.textPrimaryDark,
  },
  iconChar: {
    fontSize: 22,
    fontWeight: '700',
    includeFontPadding: false,
  },
});
