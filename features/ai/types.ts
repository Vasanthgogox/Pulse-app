/**
 * AI Decision Layer — types for risk scores, trip predictions, cashflow, settings.
 * Tables live in Q-unified-base; this app consumes via Supabase.
 */

export interface ClientRiskScore {
  id: string;
  organization_id: string;
  client_id: string;
  risk_score: number;
  predicted_delay: number;
  last_updated: string;
}

export interface TripPrediction {
  id: string;
  organization_id: string;
  trip_id: string;
  predicted_cost: number;
  predicted_profit: number;
  confidence_score: number;
  risk_flag: 'low_margin' | 'ok' | 'high_risk' | string;
  created_at: string;
}

export interface VehicleHealthScore {
  id: string;
  organization_id: string;
  vehicle_id: string;
  health_score: number;
  next_maintenance_at: string | null;
  breakdown_probability: number | null;
  last_updated: string;
}

export interface CashflowForecastDay {
  id: string;
  organization_id: string;
  date: string;
  expected_inflow: number;
  confidence: number;
  created_at: string;
}

export interface AISettings {
  id: string;
  organization_id: string;
  auto_post_ocr: boolean;
  auto_flag_risk: boolean;
  auto_enforce_credit: boolean;
  auto_assign_vehicle: boolean;
  updated_at: string;
}

export interface AIInsightsSummary {
  cashflowNext30Days: number;
  shortfallRisk: boolean;
  profitPredictionAccuracyPct: number | null;
  paymentDelayAccuracyPct: number | null;
  highRiskClientsCount: number;
  /** When false, backend has no forecast/insights yet; show empty state. */
  hasData?: boolean;
}
