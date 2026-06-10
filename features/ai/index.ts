/**
 * AI Decision Layer — risk scores, trip predictions, vehicle health, cashflow, insights.
 * Backend schema: docs/AI_SYSTEM_SCHEMA_AND_BACKEND.md (pulse-unified-base migrations).
 */
export { TripAIBadges } from './components/TripAIBadges';
export { ClientRiskBadge } from './components/ClientRiskBadge';
export { VehicleHealthBadge } from './components/VehicleHealthBadge';
export { AIInsightsPanel } from './components/AIInsightsPanel';
export { AIBadge, type AIBadgeProps, type AIBadgeVariant } from './components/AIBadge';
export {
  getClientRiskScore,
  getTripPrediction,
  getVehicleHealthScore,
  getCashflowForecast,
  getAISettings,
  getAIInsightsSummary,
} from './services/ai.service';
export type {
  ClientRiskScore,
  TripPrediction,
  VehicleHealthScore,
  CashflowForecastDay,
  AISettings,
  AIInsightsSummary,
} from './types';
