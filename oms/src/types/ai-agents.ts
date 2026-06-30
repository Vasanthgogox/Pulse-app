/** Pulse AI — shared agents consumed by every module. */

export type AiAgentId =
  | 'planning_agent'
  | 'dispatch_agent'
  | 'finance_agent'
  | 'customer_agent'
  | 'driver_agent'
  | 'compliance_agent';

export interface AiAgent {
  id:          AiAgentId;
  label:       string;
  description: string;
  consumes:    ('commerce' | 'execution' | 'finance' | 'network')[];
}

export const PULSE_AI_AGENTS: AiAgent[] = [
  { id: 'planning_agent',   label: 'Planning Agent',   description: 'Merge recommendations, route optimization, utilization', consumes: ['commerce', 'execution'] },
  { id: 'dispatch_agent',   label: 'Dispatch Agent',   description: 'Driver assignment, ETA, re-routing',                   consumes: ['execution'] },
  { id: 'finance_agent',    label: 'Finance Agent',    description: 'Settlement, margin, invoice timing',                   consumes: ['finance', 'commerce'] },
  { id: 'customer_agent',   label: 'Customer Agent',   description: 'SLA risk, proactive notifications',                    consumes: ['commerce'] },
  { id: 'driver_agent',     label: 'Driver Agent',     description: 'Stop sequencing, POD quality',                         consumes: ['execution'] },
  { id: 'compliance_agent', label: 'Compliance Agent', description: 'Hazmat, permits, document checks',                     consumes: ['execution', 'network'] },
];
