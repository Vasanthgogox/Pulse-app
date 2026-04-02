/**
 * Trip page — AI badges: Predicted Profit, Risk Level.
 */
import { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { getTripPrediction } from '../services/ai.service';
import type { TripPrediction } from '../types';
import { AIBadge, type AIBadgeVariant } from './AIBadge';
import Theme from '@/constants/Theme';
import { formatINR } from '@/lib/format';

export interface TripAIBadgesProps {
  tripId: string;
}

function riskFlagToVariant(riskFlag: string | undefined): AIBadgeVariant {
  if (!riskFlag) return 'neutral';
  const f = riskFlag.toLowerCase();
  if (f === 'low_margin' || f === 'high_risk') return 'high';
  if (f === 'ok') return 'low';
  return 'medium';
}

export function TripAIBadges({ tripId }: TripAIBadgesProps) {
  const [prediction, setPrediction] = useState<TripPrediction | null>(null);

  const load = useCallback(() => {
    if (!tripId) return;
    getTripPrediction(tripId).then(({ error, data }) => {
      if (!error && data) setPrediction(data);
      else setPrediction(null);
    });
  }, [tripId]);

  useEffect(() => load(), [load]);

  if (!prediction) return null;

  const riskLabel =
    prediction.risk_flag === 'low_margin'
      ? 'Low margin'
      : prediction.risk_flag === 'high_risk'
        ? 'High risk'
        : 'Risk';

  return (
    <View style={styles.wrap}>
      <Text style={styles.sectionTitle}>AI Insights</Text>
      <View style={styles.row}>
        <AIBadge
          label="Predicted profit"
          value={formatINR(Number(prediction.predicted_profit ?? 0))}
          variant={Number(prediction.predicted_profit ?? 0) >= 0 ? 'positive' : 'high'}
        />
        <AIBadge
          label={riskLabel}
          value={
            prediction.risk_flag === 'low_margin'
              ? 'Low margin'
              : prediction.risk_flag === 'high_risk'
                ? 'High risk'
                : 'OK'
          }
          variant={riskFlagToVariant(prediction.risk_flag)}
        />
        {prediction.confidence_score != null && (
          <AIBadge
            label="Confidence"
            value={`${Math.round(Number(prediction.confidence_score) * 100)}%`}
            variant="neutral"
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: Theme.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
});
