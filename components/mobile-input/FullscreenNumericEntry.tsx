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
import { ArrowRight } from 'lucide-react-native';
import { MotiView } from 'moti';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Theme from '@/constants/Theme';
import { DecimalKeypad } from './DecimalKeypad';
import { NumericDisplay } from './NumericDisplay';
import type { NumericEntryPartyPreview } from './NumericEntryPartyBanner';
import { NumericEntryRecipientHero } from './NumericEntryRecipientHero';
import { applyKeypadPress, rawToSubmitValue, isKeypadValueSubmittable } from './keypad';
import { triggerFeedback } from './feedback';
import { useInputPlatform } from './useInputPlatform';
import type { KeypadKey, KeypadOptions } from './keypad';
import type { SmartInputType } from './types';

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
  /** Client / supplier row above the amount (avatar + name). */
  partyPreview?: NumericEntryPartyPreview;
  type?: SmartInputType;
  /** Override default prefix (currency → '₹') */
  prefix?: string;
  /** Override default suffix (percentage → '%') */
  suffix?: string;
  placeholder?: string;
  allowDecimal?: boolean;
  /** Maximum decimal places (0 = integer-only). */
  maxDecimalPlaces?: 0 | 1 | 2;
  submitLabel?: string;
  /** Inline validation error to display below the amount (from parent validation). */
  validationError?: string;
}

export function FullscreenNumericEntry({
  visible,
  onClose,
  onSubmit,
  initialValue = '',
  label,
  contextLine,
  partyPreview,
  type = 'currency',
  prefix,
  suffix,
  placeholder,
  allowDecimal = true,
  maxDecimalPlaces,
  submitLabel = 'Apply',
  validationError,
}: FullscreenNumericEntryProps) {
  const [raw, setRaw] = useState(initialValue);
  const platform = useInputPlatform();
  const insets = useSafeAreaInsets();
  const isDesktop = platform === 'desktop';
  const isTablet = platform === 'tablet';
  const isPayLayout = platform === 'mobile';

  const keypadOpts: KeypadOptions = {
    maxDecimalPlaces: allowDecimal === false ? 0 : (maxDecimalPlaces ?? 2),
  };

  // Sync initial value each time the modal opens
  useEffect(() => {
    if (visible) setRaw(initialValue);
  }, [visible, initialValue]);

  const handleKey = useCallback((key: KeypadKey) => {
    setRaw((prev) => applyKeypadPress(prev, key, keypadOpts));
  }, [keypadOpts]);

  const handleSubmit = useCallback(() => {
    if (!isKeypadValueSubmittable(raw)) return;
    triggerFeedback('apply');
    onSubmit(rawToSubmitValue(raw));
  }, [raw, onSubmit]);

  const hasValue = isKeypadValueSubmittable(raw);

  const amountDisplay = (
    <NumericDisplay
      rawValue={raw}
      type={type}
      prefix={prefix}
      suffix={suffix}
      placeholder={placeholder}
      variant={isPayLayout ? 'hero' : 'default'}
    />
  );

  const validationBlock = validationError ? (
    <Text
      style={[styles.validationError, isPayLayout && styles.validationErrorPay]}
      accessibilityRole="alert"
    >
      {validationError}
    </Text>
  ) : null;

  const innerContent = isPayLayout ? (
    <View
      style={[
        styles.inner,
        styles.innerPay,
        { paddingBottom: Math.max(insets.bottom, 6) },
      ]}
    >
      <View
        style={[
          styles.payTopBar,
          Platform.OS === 'ios' && { paddingTop: Math.max(insets.top, 8) },
        ]}
      >
        <TouchableOpacity
          style={styles.payCloseBtn}
          onPress={onClose}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Close"
        >
          <Text style={styles.payCloseText}>✕</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.payBody}>
        {partyPreview ? (
          <NumericEntryRecipientHero party={partyPreview} caption={label} />
        ) : (
          <View style={styles.payLabelOnly}>
            <Text style={styles.payLabelOnlyText}>{label}</Text>
            {contextLine ? (
              <Text style={styles.payContextLine} numberOfLines={2}>
                {contextLine}
              </Text>
            ) : null}
          </View>
        )}
        {amountDisplay}
        {validationBlock}
      </View>

      <View style={styles.payBottom}>
        <View style={styles.payFabRow}>
          <View style={styles.payFabSpacer} />
          <TouchableOpacity
            style={[styles.payFab, !hasValue && styles.payFabDisabled]}
            onPress={handleSubmit}
            disabled={!hasValue}
            accessibilityRole="button"
            accessibilityLabel={submitLabel}
          >
            <ArrowRight
              size={26}
              color={hasValue ? Theme.textOnPrimary : Theme.textMuted}
              strokeWidth={2.5}
            />
          </TouchableOpacity>
        </View>
        <DecimalKeypad onKey={handleKey} showDecimal={allowDecimal} variant="pay" />
      </View>
    </View>
  ) : (
    <View
      style={[
        styles.inner,
        isDesktop && styles.innerDesktop,
        isTablet && styles.innerTablet,
        { paddingBottom: isDesktop || isTablet ? 24 : Math.max(insets.bottom, 16) },
      ]}
    >
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

      {partyPreview ? (
        <NumericEntryRecipientHero party={partyPreview} caption={label} />
      ) : null}

      {amountDisplay}
      {validationBlock}

      <DecimalKeypad onKey={handleKey} showDecimal={allowDecimal} />
    </View>
  );

  // ── Desktop: right drawer with spring slide-in ────────────────────────
  if (isDesktop) {
    return (
      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={onClose}
        statusBarTranslucent
        accessibilityViewIsModal
      >
        <View style={styles.desktopOverlay}>
          <TouchableWithoutFeedback onPress={onClose} accessibilityLabel="Close">
            <View style={StyleSheet.absoluteFillObject} />
          </TouchableWithoutFeedback>
          <MotiView
            from={{ translateX: 480 }}
            animate={{ translateX: 0 }}
            transition={{ type: 'spring', damping: 32, stiffness: 320, mass: 0.9 }}
            style={styles.desktopDrawer}
          >
            {innerContent}
          </MotiView>
        </View>
      </Modal>
    );
  }

  // ── Tablet: centered modal with spring scale-in ────────────────────────
  if (isTablet) {
    return (
      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={onClose}
        statusBarTranslucent
        accessibilityViewIsModal
      >
        <View style={styles.tabletOverlay}>
          <TouchableWithoutFeedback onPress={onClose} accessibilityLabel="Close">
            <View style={StyleSheet.absoluteFillObject} />
          </TouchableWithoutFeedback>
          <MotiView
            from={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            style={styles.tabletModal}
          >
            {innerContent}
          </MotiView>
        </View>
      </Modal>
    );
  }

  // ── Mobile: full-screen slide-up (native OS sheet transition) ─────────
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
      statusBarTranslucent={Platform.OS === 'android'}
      accessibilityViewIsModal
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
  innerPay: {
    justifyContent: 'space-between',
  },
  payTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingBottom: 4,
    minHeight: 48,
  },
  payCloseBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  payCloseText: {
    fontSize: 22,
    fontWeight: '300',
    color: Theme.textPrimary,
    lineHeight: 24,
  },
  payBody: {
    flex: 1,
    justifyContent: 'center',
    minHeight: 0,
  },
  payLabelOnly: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 12,
    gap: 4,
  },
  payLabelOnlyText: {
    fontSize: 18,
    fontWeight: '700',
    color: Theme.textPrimary,
    textAlign: 'center',
  },
  payContextLine: {
    fontSize: 13,
    color: Theme.textSecondary,
    textAlign: 'center',
  },
  payBottom: {
    flexShrink: 0,
  },
  payFabRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 20,
    paddingBottom: 10,
    marginTop: -4,
  },
  payFabSpacer: {
    flex: 1,
  },
  payFab: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: Theme.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Theme.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },
  payFabDisabled: {
    backgroundColor: Theme.borderLight,
    shadowOpacity: 0,
    elevation: 0,
  },
  validationErrorPay: {
    paddingTop: 4,
    paddingBottom: 0,
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
    backgroundColor: Theme.borderLight,
  },
  applyText: {
    fontSize: 15,
    fontWeight: '600',
    color: Theme.textOnPrimary,
  },
  applyTextMuted: {
    color: Theme.textSecondary,
    fontWeight: '500',
  },
  validationError: {
    fontSize: 13,
    color: Theme.negative,
    textAlign: 'center',
    paddingHorizontal: 20,
    paddingBottom: 8,
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
