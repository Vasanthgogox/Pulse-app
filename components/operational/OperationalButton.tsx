import { memo, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { colors } from '@/design-system/colors';
import { radius } from '@/design-system/radius';
import { space, touchTargetMin } from '@/design-system/spacing';
import { type DensityTier } from '@/design-system/density';

/**
 * Operational button intents — not generic “primary/secondary”.
 * Encodes hierarchy, ergonomics, and operational urgency.
 */
export type OperationalButtonIntent =
  | 'primary'
  | 'approval'
  | 'destructiveFinancial'
  | 'utility'
  | 'list'
  | 'bottomSticky';

export interface OperationalButtonProps {
  intent: OperationalButtonIntent;
  label: string;
  onPress?: () => void;
  disabled?: boolean;
  loading?: boolean;
  /** Full width (default for primary, approval, bottomSticky). */
  fullWidth?: boolean;
  density?: DensityTier;
  icon?: ReactNode;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

export const OperationalButton = memo(function OperationalButton({
  intent,
  label,
  onPress,
  disabled = false,
  loading = false,
  fullWidth,
  density: densityTier = 'medium',
  icon,
  accessibilityLabel,
  style,
}: OperationalButtonProps) {
  const isDisabled = disabled || loading || !onPress;
  const config = INTENT_STYLES[intent];
  const padY = densityTier === 'high' ? space[2] : densityTier === 'low' ? space[4] : space[3];
  const padX = intent === 'list' ? space[3] : space[4];
  const shouldFill =
    fullWidth ??
    (intent === 'primary' || intent === 'approval' || intent === 'bottomSticky');

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: config.background,
          borderColor: config.border,
          borderWidth: config.borderWidth,
          paddingVertical: padY,
          paddingHorizontal: padX,
          minHeight: intent === 'list' ? 36 : touchTargetMin,
          opacity: isDisabled ? 0.5 : pressed ? 0.92 : 1,
        },
        shouldFill && styles.fullWidth,
        intent === 'bottomSticky' && styles.bottomSticky,
        style,
      ]}
    >
      <View style={[styles.inner, icon ? styles.innerWithIcon : null]}>
        {loading ? (
          <ActivityIndicator color={config.text} size="small" />
        ) : (
          <>
            {icon ? <View style={styles.iconSlot}>{icon}</View> : null}
            <Text
              style={[
                styles.label,
                { color: config.text, fontSize: config.fontSize },
              ]}
              numberOfLines={1}
            >
              {label}
            </Text>
          </>
        )}
      </View>
    </Pressable>
  );
});

const INTENT_STYLES: Record<
  OperationalButtonIntent,
  {
    background: string;
    border: string;
    borderWidth: number;
    text: string;
    fontSize: number;
  }
> = {
  primary: {
    background: colors.brand,
    border: colors.brand,
    borderWidth: 0,
    text: colors.textOnBrand,
    fontSize: 15,
  },
  approval: {
    background: colors.revenue,
    border: colors.revenue,
    borderWidth: 0,
    text: '#ffffff',
    fontSize: 15,
  },
  destructiveFinancial: {
    background: '#fef2f2',
    border: '#fecaca',
    borderWidth: 1,
    text: colors.cost,
    fontSize: 14,
  },
  utility: {
    background: 'transparent',
    border: colors.borderDefault,
    borderWidth: 1,
    text: colors.textPrimary,
    fontSize: 14,
  },
  list: {
    background: colors.surface,
    border: colors.borderSubtle,
    borderWidth: 1,
    text: colors.textPrimary,
    fontSize: 13,
  },
  bottomSticky: {
    background: colors.brand,
    border: colors.brand,
    borderWidth: 0,
    text: colors.textOnBrand,
    fontSize: 16,
  },
};

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#0f172a',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 2,
      },
      android: { elevation: 1 },
      default: {},
    }),
  },
  fullWidth: {
    width: '100%',
  },
  bottomSticky: {
    borderRadius: radius.lg,
    minHeight: 48,
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  innerWithIcon: {
    gap: space[2],
  },
  iconSlot: {
    marginRight: 2,
  },
  label: {
    fontWeight: '600',
    letterSpacing: 0.1,
  },
});
