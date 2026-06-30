/** Pulse Observatory — commands, events, failures, audit, correlation traces. */

export type ObservatoryRecordType =
  | 'command'
  | 'event'
  | 'failure'
  | 'retry'
  | 'audit'
  | 'health';

export type ObservatoryStatus = 'success' | 'failure' | 'pending' | 'retrying';

export interface ObservatoryRecord {
  id:            string;
  type:          ObservatoryRecordType;
  correlationId: string;
  causationId?:  string;
  parentEventId?: string;
  service:       string;
  workspace:     string;
  action:        string;
  status:        ObservatoryStatus;
  latencyMs?:    number;
  occurredAt:    string;
  payload?:      unknown;
  error?:        string;
}

export type LifecycleStage =
  | 'plan_created'
  | 'gateway_command'
  | 'execution_received'
  | 'indent_created'
  | 'driver_assigned'
  | 'trip_started'
  | 'stop_arrived'
  | 'pod_uploaded'
  | 'trip_completed'
  | 'settlement'
  | 'invoice'
  | 'commerce_updated';

export const LIFECYCLE_LABELS: Record<LifecycleStage, string> = {
  plan_created:         'Execution plan created',
  gateway_command:      'Gateway command',
  execution_received:   'Execution received plan',
  indent_created:       'Indent created',
  driver_assigned:      'Dispatcher assigned vehicle',
  trip_started:         'Trip started',
  stop_arrived:         'Stop arrived',
  pod_uploaded:         'POD uploaded',
  trip_completed:       'Trip completed',
  settlement:           'Settlement completed',
  invoice:              'Invoice generated',
  commerce_updated:     'Commerce updated',
};
