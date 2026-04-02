/**
 * Vehicle page — Health Score badge.
 */
import { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { getVehicleHealthScore } from '../services/ai.service';
import type { VehicleHealthScore } from '../types';
import { AIBadge, type AIBadgeVariant } from './AIBadge';
import Theme from '@/constants/Theme';
export interface VehicleHealthBadgeProps {
  organizationId: string | null;
  vehicleId: string;
}

function healthToVariant(score: number): AIBadgeVariant {
  if (score >= 70) return 'low';
  if (score >= 40) return 'medium';
  return 'high';
}

function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export function VehicleHealthBadge({
  organizationId,
  vehicleId,
}: VehicleHealthBadgeProps) {
  const [health, setHealth] = useState<VehicleHealthScore | null>(null);

  const load = useCallback(() => {
    if (!organizationId || !vehicleId) return;
    getVehicleHealthScore(organizationId, vehicleId).then(({ error, data }) => {
      if (!error && data) setHealth(data);
      else setHealth(null);
    });
  }, [organizationId, vehicleId]);

  useEffect(() => load(), [load]);

  if (!health) {
    return (
      <Text style={styles.noData}>No AI health data yet</Text>
    );
  }

  const nextMaintenance =
    health.next_maintenance_at != null
      ? formatDateShort(health.next_maintenance_at)
      : null;

  return (
    <View style={styles.wrap}>
      <AIBadge
        label="Health score"
        value={`${health.health_score}/100`}
        variant={healthToVariant(health.health_score)}
      />
      {nextMaintenance != null && (
        <AIBadge
          label="Next maintenance"
          value={nextMaintenance}
          variant="neutral"
        />
      )}
      {health.breakdown_probability != null &&
        Number(health.breakdown_probability) > 0.3 && (
          <AIBadge
            label="Breakdown risk"
            value={`${Math.round(Number(health.breakdown_probability) * 100)}%`}
            variant={Number(health.breakdown_probability) > 0.6 ? 'high' : 'medium'}
          />
        )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  noData: {
    fontSize: 12,
    color: Theme.textSecondary,
  },
});
