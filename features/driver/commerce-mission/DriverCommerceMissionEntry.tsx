/**
 * Optional Home sibling CTA: open the read-only Commerce Delivery Mission.
 *
 * Gate is Primitive A only (`hasCommerceExecutionPlan`). Loading / error /
 * non-Commerce render nothing so Home never shows RPC or DB copy.
 *
 * Does not replace DriverTripFlowCard or mutate trip / stop / order state.
 */
import { useDriverThemeColors } from '@/contexts/DriverThemeContext';
import { hasCommerceExecutionPlan } from '@/features/driver/commerce-mission/normalizeDriverTripStopOrders';
import { useDriverCommerceMission } from '@/features/driver/commerce-mission/useDriverCommerceMission';
import Layout from '@/constants/Layout';
import { ROUTES } from '@/lib/routes';
import { useRouter, type Href } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';

type Props = {
  tripId: string;
};

export function DriverCommerceMissionEntry({ tripId }: Props) {
  const router = useRouter();
  const colors = useDriverThemeColors();
  const state = useDriverCommerceMission(tripId);

  if (state.status !== 'ready') return null;
  if (!hasCommerceExecutionPlan(state.mission)) return null;

  return (
    <Pressable
      testID="commerce-mission-entry"
      accessibilityRole="button"
      accessibilityLabel="Delivery Mission, View orders"
      onPress={() => router.push(ROUTES.driverCommerceMission(tripId) as Href)}
      style={[
        styles.cta,
        { backgroundColor: colors.surface, borderColor: colors.borderSubtle },
      ]}
    >
      <Text style={[styles.title, { color: colors.text }]}>Delivery Mission</Text>
      <Text style={[styles.subtitle, { color: colors.textMuted }]}>View orders</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  cta: {
    minHeight: Layout.minTouchTargetSize,
    marginHorizontal: Layout.screenPaddingHorizontal,
    marginBottom: Layout.spacingMedium,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 13,
    fontWeight: '500',
    marginTop: 2,
  },
});
