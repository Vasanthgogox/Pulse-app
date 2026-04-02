/**
 * Dashboard / Finance — AI Insights panel: cashflow forecast, shortfall risk, accuracy.
 */
import { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { getAIInsightsSummary } from '../services/ai.service';
import type { AIInsightsSummary } from '../types';
import Theme from '@/constants/Theme';
import { formatINR } from '@/lib/format';
import FontAwesome from '@expo/vector-icons/FontAwesome';

export interface AIInsightsPanelProps {
  organizationId: string | null;
}

export function AIInsightsPanel({ organizationId }: AIInsightsPanelProps) {
  const [insights, setInsights] = useState<AIInsightsSummary | null>(null);

  const load = useCallback(() => {
    if (!organizationId) return;
    getAIInsightsSummary(organizationId).then(({ error, data }) => {
      if (!error && data) setInsights(data);
      else setInsights(null);
    });
  }, [organizationId]);

  useEffect(() => load(), [load]);

  if (!insights) return null;

  const hasData = 'hasData' in insights && insights.hasData;

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <FontAwesome name="lightbulb-o" size={16} color={Theme.textSecondary} />
        <Text style={styles.title}>AI Insights</Text>
      </View>
      <View style={styles.row}>
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Next 30 days (expected inflow)</Text>
          <Text style={styles.cardValue}>
            {hasData ? formatINR(insights.cashflowNext30Days) : '—'}
          </Text>
        </View>
        {hasData && insights.shortfallRisk && (
          <View style={[styles.card, styles.cardWarn]}>
            <Text style={styles.cardWarnText}>Shortfall risk</Text>
          </View>
        )}
      </View>
      {(insights.profitPredictionAccuracyPct != null ||
        insights.paymentDelayAccuracyPct != null) && (
        <View style={styles.accuracyRow}>
          {insights.profitPredictionAccuracyPct != null && (
            <Text style={styles.accuracyText}>
              Profit prediction accuracy: {Math.round(insights.profitPredictionAccuracyPct)}%
            </Text>
          )}
          {insights.paymentDelayAccuracyPct != null && (
            <Text style={styles.accuracyText}>
              Payment delay accuracy: {Math.round(insights.paymentDelayAccuracyPct)}%
            </Text>
          )}
        </View>
      )}
      {hasData && insights.highRiskClientsCount > 0 && (
        <Text style={styles.riskText}>
          {insights.highRiskClientsCount} client(s) with high payment risk
        </Text>
      )}
      {!hasData && (
        <Text style={styles.emptyText}>No AI data yet. Connect backend to see cashflow and accuracy.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: Theme.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.border,
    padding: 14,
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
    color: Theme.textPrimaryDark,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  card: {
    backgroundColor: Theme.surfaceGray,
    borderRadius: 8,
    padding: 10,
    minWidth: 120,
  },
  cardLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: Theme.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 4,
  },
  cardValue: {
    fontSize: 16,
    fontWeight: '700',
    color: Theme.textPrimaryDark,
  },
  cardWarn: {
    backgroundColor: Theme.negativeMuted ?? 'rgba(220,38,38,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(220,38,38,0.25)',
  },
  cardWarnText: {
    fontSize: 12,
    fontWeight: '600',
    color: Theme.negative,
  },
  accuracyRow: {
    marginTop: 10,
    gap: 4,
  },
  accuracyText: {
    fontSize: 11,
    color: Theme.textSecondary,
  },
  riskText: {
    fontSize: 11,
    color: Theme.negative,
    marginTop: 8,
    fontWeight: '600',
  },
  emptyText: {
    fontSize: 12,
    color: Theme.textSecondary,
    marginTop: 10,
    fontStyle: 'italic',
  },
});
