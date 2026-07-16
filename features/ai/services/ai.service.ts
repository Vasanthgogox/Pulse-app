/**
 * AI Decision Layer — service to fetch risk scores, trip predictions, vehicle health, cashflow, settings.
 * Tables (client_risk_scores, trip_predictions, vehicle_health_scores, cashflow_forecast, ai_settings)
 * are defined in pulse-unified-base; see docs/AI_SYSTEM_SCHEMA_AND_BACKEND.md.
 * When tables do not exist yet, calls return null/empty and UI shows "—".
 */
import { supabase } from '@/lib/supabase';
import type {
  ClientRiskScore,
  TripPrediction,
  VehicleHealthScore,
  CashflowForecastDay,
  AISettings,
  AIInsightsSummary,
} from '../types';

function isSchemaMissingError(message: string | undefined): boolean {
  const msg = String(message ?? '').toLowerCase();
  return (
    msg.includes('404') ||
    // 406 / PGRST schema-cache misses: table/schema not exposed by PostgREST
    // (these tables are optional in some environments — degrade to empty).
    msg.includes('406') ||
    msg.includes('not acceptable') ||
    msg.includes('pgrst106') ||
    msg.includes('pgrst205') ||
    msg.includes('not found') ||
    msg.includes('relation') ||
    msg.includes('does not exist')
  );
}

export async function getClientRiskScore(
  organizationId: string,
  clientId: string
): Promise<{ error: Error | null; data: ClientRiskScore | null }> {
  try {
    const { data, error } = await supabase()
      .from('client_risk_scores')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('client_id', clientId)
      .maybeSingle();
    if (error) return { error: new Error(error.message), data: null };
    return { error: null, data: data as ClientRiskScore | null };
  } catch (e) {
    return { error: e instanceof Error ? e : new Error(String(e)), data: null };
  }
}

export async function getTripPrediction(
  tripId: string
): Promise<{ error: Error | null; data: TripPrediction | null }> {
  try {
    const { data, error } = await supabase()
      .from('trip_predictions')
      .select('*')
      .eq('trip_id', tripId)
      .maybeSingle();
    if (error) return { error: new Error(error.message), data: null };
    return { error: null, data: data as TripPrediction | null };
  } catch (e) {
    return { error: e instanceof Error ? e : new Error(String(e)), data: null };
  }
}

export async function getVehicleHealthScore(
  organizationId: string,
  vehicleId: string
): Promise<{ error: Error | null; data: VehicleHealthScore | null }> {
  try {
    const { data, error } = await supabase()
      .from('vehicle_health_scores')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('vehicle_id', vehicleId)
      .maybeSingle();
    if (error) return { error: new Error(error.message), data: null };
    return { error: null, data: data as VehicleHealthScore | null };
  } catch (e) {
    return { error: e instanceof Error ? e : new Error(String(e)), data: null };
  }
}

export async function getCashflowForecast(
  organizationId: string,
  fromDate: string
): Promise<{ error: Error | null; data: CashflowForecastDay[] }> {
  try {
    const { data, error } = await supabase()
      .from('cashflow_forecast')
      .select('*')
      .eq('organization_id', organizationId)
      .gte('date', fromDate)
      .order('date', { ascending: true })
      .limit(30);
    // `cashflow_forecast` is optional in some environments.
    // Treat missing table/schema as empty data instead of surfacing runtime noise.
    if (error) {
      if (isSchemaMissingError(error.message)) return { error: null, data: [] };
      return { error: new Error(error.message), data: [] };
    }
    return { error: null, data: (data ?? []) as CashflowForecastDay[] };
  } catch (e) {
    if (e instanceof Error && isSchemaMissingError(e.message)) {
      return { error: null, data: [] };
    }
    return { error: e instanceof Error ? e : new Error(String(e)), data: [] };
  }
}

export async function getAISettings(
  organizationId: string
): Promise<{ error: Error | null; data: AISettings | null }> {
  try {
    const { data, error } = await supabase()
      .from('ai_settings')
      .select('*')
      .eq('organization_id', organizationId)
      .maybeSingle();
    if (error) return { error: new Error(error.message), data: null };
    return { error: null, data: data as AISettings | null };
  } catch (e) {
    return { error: e instanceof Error ? e : new Error(String(e)), data: null };
  }
}

/** Aggregate view for dashboard: next 30 days inflow + optional accuracy metrics. Always returns data (use hasData to show empty state). */
export async function getAIInsightsSummary(
  organizationId: string
): Promise<{ error: Error | null; data: AIInsightsSummary | null }> {
  const today = new Date().toISOString().slice(0, 10);
  const { error: cfError, data: forecast } = await getCashflowForecast(
    organizationId,
    today
  );
  const emptySummary: AIInsightsSummary & { hasData: boolean } = {
    cashflowNext30Days: 0,
    shortfallRisk: false,
    profitPredictionAccuracyPct: null,
    paymentDelayAccuracyPct: null,
    highRiskClientsCount: 0,
    hasData: false,
  };
  if (cfError) {
    return { error: cfError, data: { ...emptySummary } };
  }
  if (!forecast?.length) {
    return { error: null, data: { ...emptySummary } };
  }
  const cashflowNext30Days = forecast.reduce(
    (sum, row) => sum + Number(row.expected_inflow ?? 0),
    0
  );
  const avgConfidence =
    forecast.reduce((s, r) => s + Number(r.confidence ?? 0), 0) /
    Math.max(1, forecast.length);
  return {
    error: null,
    data: {
      cashflowNext30Days,
      shortfallRisk: avgConfidence < 0.5,
      profitPredictionAccuracyPct: null,
      paymentDelayAccuracyPct: null,
      highRiskClientsCount: 0,
      hasData: true,
    },
  };
}
