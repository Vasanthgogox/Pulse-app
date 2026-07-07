import { memo } from 'react';
import { Platform, Pressable, StyleSheet, Text } from 'react-native';
import { ChevronRight } from 'lucide-react-native';

import Theme from '@/constants/Theme';
import type { WorkspaceAccessAction } from '@/lib/onboarding/productCatalog';

import { ONBOARDING_BRAND } from './onboardingPersonaAssets';

export interface PulseAccessOptionProps {
  action: WorkspaceAccessAction;
  onPress: () => void;
  compact?: boolean;
}

export const PulseAccessOption = memo(function PulseAccessOption({
  action,
  onPress,
  compact = false,
}: PulseAccessOptionProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed, hovered }) => [
        styles.row,
        compact && styles.rowCompact,
        (pressed || (Platform.OS === 'web' && hovered)) && styles.rowPressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={action.title}
    >
      <Text style={[styles.title, compact && styles.titleCompact]}>{action.title}</Text>
      <ChevronRight size={compact ? 14 : 16} color={Theme.textMuted} strokeWidth={2} />
    </Pressable>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: Theme.cardWhite,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(77, 54, 54, 0.08)',
    ...Platform.select({
      web: {
        transition: 'border-color 0.15s ease, background-color 0.15s ease',
      } as object,
      default: {},
    }),
  },
  rowPressed: {
    borderColor: 'rgba(77, 54, 54, 0.18)',
    backgroundColor: Theme.analyticsCanvas,
  },
  rowCompact: {
    paddingVertical: 9,
    paddingHorizontal: 12,
  },
  title: {
    flex: 1,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
    color: ONBOARDING_BRAND.ink,
  },
  titleCompact: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '500',
  },
});
