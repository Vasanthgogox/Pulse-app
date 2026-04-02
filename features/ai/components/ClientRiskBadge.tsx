/**
 * Ledger / Entity overlay — Client Risk Score badge.
 */
import { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { getClientRiskScore } from '../services/ai.service';
import type { ClientRiskScore } from '../types';
import { AIBadge, type AIBadgeVariant } from './AIBadge';
import Theme from '@/constants/Theme';

export interface ClientRiskBadgeProps {
  organizationId: string | null;
  clientId: string;
}

function scoreToVariant(score: number): AIBadgeVariant {
  if (score <= 30) return 'low';
  if (score <= 60) return 'medium';
  return 'high';
}

export function ClientRiskBadge({ organizationId, clientId }: ClientRiskBadgeProps) {
  const [risk, setRisk] = useState<ClientRiskScore | null>(null);

  const load = useCallback(() => {
    if (!organizationId || !clientId) return;
    getClientRiskScore(organizationId, clientId).then(({ error, data }) => {
      if (!error && data) setRisk(data);
      else setRisk(null);
    });
  }, [organizationId, clientId]);

  useEffect(() => load(), [load]);

  if (!risk) return null;

  return (
    <View style={styles.wrap}>
      <AIBadge
        label="Payment risk score"
        value={`${risk.risk_score}/100`}
        variant={scoreToVariant(risk.risk_score)}
      />
      {risk.predicted_delay != null && risk.predicted_delay > 0 && (
        <AIBadge
          label="Predicted delay"
          value={`${risk.predicted_delay} days`}
          variant={risk.predicted_delay > 7 ? 'high' : 'medium'}
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
});
