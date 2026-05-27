/**
 * Tappable field that opens the fullscreen entry flow.
 *
 * Two variants:
 *   'row'   — label left, value right with chevron (for form rows / list sections)
 *   'field' — stacked label above value (for boxed form fields)
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Theme from '@/constants/Theme';

export type TriggerVariant = 'row' | 'field';
export type TriggerValueColor = 'default' | 'positive' | 'negative';

export interface SmartInputTriggerProps {
  label: string;
  displayValue?: string;
  placeholder?: string;
  onPress: () => void;
  disabled?: boolean;
  prefix?: string;
  suffix?: string;
  valueColor?: TriggerValueColor;
  variant?: TriggerVariant;
  required?: boolean;
  errorMessage?: string;
}

export function SmartInputTrigger({
  label,
  displayValue,
  placeholder = 'Tap to enter',
  onPress,
  disabled = false,
  prefix,
  suffix,
  valueColor = 'default',
  variant = 'row',
  required = false,
  errorMessage,
}: SmartInputTriggerProps) {
  const hasValue = !!displayValue;

  const valueStyle =
    valueColor === 'positive'
      ? styles.valuePositive
      : valueColor === 'negative'
      ? styles.valueNegative
      : undefined;

  if (variant === 'field') {
    return (
      <TouchableOpacity
        style={[
          styles.field,
          disabled && styles.fieldDisabled,
          !!errorMessage && styles.fieldHasError,
        ]}
        onPress={onPress}
        disabled={disabled}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${displayValue || placeholder}`}
        accessibilityState={{ disabled }}
      >
        <Text style={styles.fieldLabel}>
          {label}
          {required ? <Text style={styles.required}> *</Text> : null}
        </Text>
        <View style={styles.fieldValueRow}>
          {prefix && hasValue ? (
            <Text style={[styles.fieldPrefix, valueStyle]}>{prefix}</Text>
          ) : null}
          <Text
            style={[
              styles.fieldValue,
              !hasValue && styles.fieldPlaceholder,
              valueStyle,
            ]}
          >
            {hasValue ? displayValue : placeholder}
          </Text>
          {suffix && hasValue ? (
            <Text style={[styles.fieldSuffix, valueStyle]}>{suffix}</Text>
          ) : null}
        </View>
        {errorMessage ? (
          <Text style={styles.errorText}>{errorMessage}</Text>
        ) : null}
      </TouchableOpacity>
    );
  }

  // 'row' variant (default)
  return (
    <View style={styles.rowWrapper}>
      <TouchableOpacity
        style={[styles.row, disabled && styles.rowDisabled]}
        onPress={onPress}
        disabled={disabled}
        activeOpacity={0.65}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${displayValue || placeholder}`}
        accessibilityState={{ disabled }}
      >
        <Text style={styles.rowLabel}>
          {label}
          {required ? <Text style={styles.required}> *</Text> : null}
        </Text>
        <View style={styles.rowRight}>
          {prefix && hasValue ? (
            <Text style={[styles.rowPrefix, valueStyle]}>{prefix}</Text>
          ) : null}
          <Text
            style={[
              styles.rowValue,
              !hasValue && styles.rowPlaceholder,
              valueStyle,
            ]}
          >
            {hasValue ? displayValue : placeholder}
          </Text>
          {suffix && hasValue ? (
            <Text style={[styles.rowSuffix, valueStyle]}>{suffix}</Text>
          ) : null}
          <Text style={styles.chevron}>›</Text>
        </View>
      </TouchableOpacity>
      {errorMessage ? (
        <Text style={styles.rowErrorText}>{errorMessage}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // ── Row variant ──
  rowWrapper: {
    width: '100%',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: Theme.screenBackground,
    minHeight: 52,
  },
  rowDisabled: {
    opacity: 0.45,
  },
  rowLabel: {
    fontSize: 16,
    fontWeight: '400',
    color: Theme.textPrimary,
    flex: 1,
  },
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    flexShrink: 0,
    maxWidth: '60%',
  },
  rowPrefix: {
    fontSize: 14,
    fontWeight: '400',
    color: Theme.textBody,
  },
  rowValue: {
    fontSize: 16,
    fontWeight: '600',
    color: Theme.textBody,
    // @ts-ignore
    fontVariant: ['tabular-nums'],
    textAlign: 'right',
  },
  rowPlaceholder: {
    color: Theme.textMuted,
    fontWeight: '400',
    fontSize: 15,
  },
  rowSuffix: {
    fontSize: 13,
    color: Theme.textSecondary,
    marginLeft: 2,
  },
  chevron: {
    fontSize: 22,
    color: Theme.textMuted,
    marginLeft: 4,
    lineHeight: 24,
  },
  rowErrorText: {
    fontSize: 12,
    color: Theme.negative,
    paddingHorizontal: 16,
    paddingBottom: 6,
  },

  // ── Field variant ──
  field: {
    backgroundColor: Theme.surface,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    minHeight: 64,
    justifyContent: 'center',
  },
  fieldDisabled: {
    opacity: 0.45,
  },
  fieldHasError: {
    borderColor: Theme.negative,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: Theme.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  fieldValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 3,
  },
  fieldPrefix: {
    fontSize: 15,
    fontWeight: '400',
    color: Theme.textBody,
  },
  fieldValue: {
    fontSize: 18,
    fontWeight: '600',
    color: Theme.textBody,
    // @ts-ignore
    fontVariant: ['tabular-nums'],
  },
  fieldPlaceholder: {
    color: Theme.textMuted,
    fontWeight: '400',
    fontSize: 16,
  },
  fieldSuffix: {
    fontSize: 13,
    color: Theme.textSecondary,
  },
  errorText: {
    fontSize: 12,
    color: Theme.negative,
    marginTop: 4,
  },

  // ── Shared ──
  required: {
    color: Theme.negative,
    fontWeight: '600',
  },
  valuePositive: {
    color: Theme.positive,
  },
  valueNegative: {
    color: Theme.negative,
  },
});
