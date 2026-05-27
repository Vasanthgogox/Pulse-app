/**
 * Platform-adaptive focused numeric entry.
 *
 * Mobile / web-mobile  → full-screen modal (slide up)
 * Tablet               → centered modal, max 480 wide
 * Desktop (web ≥1024)  → right-side drawer, max 480 wide
 *
 * Uses a custom DecimalKeypad — no native keyboard for financial inputs.
 */
import React, { useState, useCallback, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  TouchableWithoutFeedback,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Theme from '@/constants/Theme';
import { DecimalKeypad } from './DecimalKeypad';
import { NumericDisplay } from './NumericDisplay';
import { applyKeypadPress, rawToSubmitValue } from './keypad';
import { useInputPlatform } from './useInputPlatform';
import type { KeypadKey } from './keypad';

export interface FullscreenNumericEntryProps {
  visible: boolean;
  onClose: () => void;
  /** Called with the raw submit string ("45000", "7.5", etc.) */
  onSubmit: (value: string) => void;
  /** Pre-fill the entry with this value (stripped of formatting) */
  initialValue?: string;
  /** Header label, e.g. "Supplier Cost" */
  label: string;
  /** Secondary context shown below the label, e.g. "Trip: BLR → CHN" */
  contextLine?: string;
  type?: 'currency' | 'numeric' | 'percentage';
  /** Override default prefix (currency → '₹') */
  prefix?: string;
  /** Override default suffix (percentage → '%') */
  suffix?: string;
  placeholder?: string;
  allowDecimal?: boolean;
  submitLabel?: string;
}

export function FullscreenNumericEntry({
  visible,
  onClose,
  onSubmit,
  initialValue = '',
  label,
  contextLine,
  type = 'currency',
  prefix,
  suffix,
  placeholder,
  allowDecimal = true,
  submitLabel = 'Apply',
}: FullscreenNumericEntryProps) {
  const [raw, setRaw] = useState(initialValue);
  const platform = useInputPlatform();
  const insets = useSafeAreaInsets();
  const isDesktop = platform === 'desktop';
  const isTablet = platform === 'tablet';

  // Sync initial value each time the modal opens
  useEffect(() => {
    if (visible) setRaw(initialValue);
  }, [visible, initialValue]);

  const handleKey = useCallback((key: KeypadKey) => {
    setRaw((prev) => applyKeypadPress(prev, key));
  }, []);

  const handleSubmit = useCallback(() => {
    onSubmit(rawToSubmitValue(raw));
  }, [raw, onSubmit]);

  const hasValue = raw.length > 0 && raw !== '0.';

  const innerContent = (
    <View
      style={[
        styles.inner,
        isDesktop && styles.innerDesktop,
        isTablet && styles.innerTablet,
        { paddingBottom: isDesktop || isTablet ? 24 : Math.max(insets.bottom, 16) },
      ]}
    >
      {/* ── Header ── */}
      <View
        style={[
          styles.header,
          (isDesktop || isTablet) && styles.headerElevated,
          { paddingTop: isDesktop || isTablet ? 20 : Math.max(insets.top - 8, 0) },
        ]}
      >
        <TouchableOpacity
          style={styles.closeBtn}
          onPress={onClose}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Cancel"
        >
          <Text style={styles.closeBtnText}>✕</Text>
        </TouchableOpacity>

        <View style={styles.headerMid}>
          <Text style={styles.headerLabel} numberOfLines={1}>
            {label}
          </Text>
          {contextLine ? (
            <Text style={styles.headerContext} numberOfLines={2}>
              {contextLine}
            </Text>
          ) : null}
        </View>

        <TouchableOpacity
          style={[styles.applyBtn, !hasValue && styles.applyBtnMuted]}
          onPress={handleSubmit}
          disabled={!hasValue}
          accessibilityRole="button"
          accessibilityLabel={submitLabel}
        >
          <Text style={[styles.applyText, !hasValue && styles.applyTextMuted]}>
            {submitLabel}
          </Text>
        </TouchableOpacity>
      </View>

      {/* ── Amount Display ── */}
      <NumericDisplay
        rawValue={raw}
        type={type}
        prefix={prefix}
        suffix={suffix}
        placeholder={placeholder}
      />

      {/* ── Keypad ── */}
      <DecimalKeypad onKey={handleKey} showDecimal={allowDecimal} />
    </View>
  );

  // ── Desktop: right drawer ──────────────────────────────────────────────
  if (isDesktop) {
    return (
      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={onClose}
        statusBarTranslucent
      >
        <View style={styles.desktopOverlay}>
          <TouchableWithoutFeedback onPress={onClose}>
            <View style={StyleSheet.absoluteFillObject} />
          </TouchableWithoutFeedback>
          <View style={styles.desktopDrawer}>
            {innerContent}
          </View>
        </View>
      </Modal>
    );
  }

  // ── Tablet: centered modal ─────────────────────────────────────────────
  if (isTablet) {
    return (
      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={onClose}
        statusBarTranslucent
      >
        <View style={styles.tabletOverlay}>
          <TouchableWithoutFeedback onPress={onClose}>
            <View style={StyleSheet.absoluteFillObject} />
          </TouchableWithoutFeedback>
          <View style={styles.tabletModal}>
            {innerContent}
          </View>
        </View>
      </Modal>
    );
  }

  // ── Mobile: full-screen slide-up ───────────────────────────────────────
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle={Platform.OS === 'ios' ? 'fullScreen' : 'fullScreen'}
      onRequestClose={onClose}
      statusBarTranslucent={Platform.OS === 'android'}
    >
      <View
        style={[
          styles.mobileContainer,
          Platform.OS === 'android' && { paddingTop: insets.top },
        ]}
      >
        {innerContent}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  // ── Mobile ──
  mobileContainer: {
    flex: 1,
    backgroundColor: Theme.screenBackground,
  },
  inner: {
    flex: 1,
    backgroundColor: Theme.screenBackground,
  },
  innerDesktop: {
    flex: 1,
  },
  innerTablet: {
    borderRadius: 16,
    overflow: 'hidden',
  },

  // ── Header ──
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.border,
    minHeight: 56,
    gap: 8,
  },
  headerElevated: {
    borderBottomColor: Theme.borderMedium,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Theme.surface,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  closeBtnText: {
    fontSize: 15,
    color: Theme.textSecondary,
    lineHeight: 18,
  },
  headerMid: {
    flex: 1,
    alignItems: 'center',
    minWidth: 0,
  },
  headerLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: Theme.textPrimary,
    textAlign: 'center',
  },
  headerContext: {
    fontSize: 12,
    color: Theme.textSecondary,
    marginTop: 2,
    textAlign: 'center',
  },
  applyBtn: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 8,
    backgroundColor: Theme.primary,
    minWidth: 68,
    alignItems: 'center',
    flexShrink: 0,
  },
  applyBtnMuted: {
    backgroundColor: Theme.surface,
  },
  applyText: {
    fontSize: 14,
    fontWeight: '700',
    color: Theme.textOnPrimary,
  },
  applyTextMuted: {
    color: Theme.textMuted,
  },

  // ── Desktop right drawer ──
  desktopOverlay: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    backgroundColor: Theme.overlayBackdrop,
  },
  desktopDrawer: {
    width: 480,
    backgroundColor: Theme.screenBackground,
    shadowColor: '#000',
    shadowOffset: { width: -2, height: 0 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 24,
  },

  // ── Tablet centered modal ──
  tabletOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Theme.overlayBackdrop,
    padding: 32,
  },
  tabletModal: {
    width: '100%',
    maxWidth: 480,
    backgroundColor: Theme.screenBackground,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
    elevation: 20,
    overflow: 'hidden',
    maxHeight: '85%' as unknown as number,
  },
});
