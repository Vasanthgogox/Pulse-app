/**
 * Reusable AI badge: label + value + optional risk/health color.
 */
import Theme from '@/constants/Theme';
import { View, Text, StyleSheet } from 'react-native';

export type AIBadgeVariant = 'neutral' | 'low' | 'medium' | 'high' | 'positive';

const VARIANT_COLORS: Record<AIBadgeVariant, { bg: string; text: string; border: string }> = {
  neutral: { bg: Theme.surfaceGray, text: Theme.textPrimary, border: Theme.borderInput },
  low: { bg: Theme.positiveMuted, text: Theme.positive, border: 'rgba(21,128,61,0.3)' },
  medium: { bg: 'rgba(245,158,11,0.15)', text: '#B45309', border: 'rgba(245,158,11,0.3)' },
  high: { bg: Theme.negativeMuted ?? 'rgba(220,38,38,0.12)', text: Theme.negative, border: 'rgba(220,38,38,0.25)' },
  positive: { bg: Theme.positiveMuted, text: Theme.positive, border: 'rgba(21,128,61,0.3)' },
};

export interface AIBadgeProps {
  label: string;
  value: string;
  variant?: AIBadgeVariant;
}

export function AIBadge({ label, value, variant = 'neutral' }: AIBadgeProps) {
  const colors = VARIANT_COLORS[variant];
  return (
    <View style={[styles.wrap, { backgroundColor: colors.bg, borderColor: colors.border }]}>
      <Text style={styles.label} numberOfLines={1}>{label}</Text>
      <Text style={[styles.value, { color: colors.text }]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    minWidth: 0,
  },
  label: {
    fontSize: 10,
    fontWeight: '600',
    color: Theme.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  value: {
    fontSize: 13,
    fontWeight: '700',
  },
});
