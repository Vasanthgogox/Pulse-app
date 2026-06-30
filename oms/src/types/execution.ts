import type { PublishExecutionPlanCommand } from '@/lib/execution-api';

export type ExecutionJobStatus =
  | 'received'
  | 'assigned'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

export interface ExecutionTripStop {
  stopId:      string;
  sequence:    number;
  label:       string;
  type:        'pickup' | 'drop';
  city:        string;
  status:      'pending' | 'arrived' | 'completed';
  podRequired: boolean;
  podRef?:     string;
  completedAt?: string;
}

export interface ExecutionJob {
  id:               string;
  correlationId:    string;
  executionPlanId:  string;
  planNumber:       string;
  command:          PublishExecutionPlanCommand;
  status:           ExecutionJobStatus;
  stops:            ExecutionTripStop[];
  indentId?:        string;
  indentCode?:      string;
  tripId?:          string;
  driverId?:        string;
  driverName?:      string;
  vehicleId?:       string;
  vehicleLabel?:    string;
  receivedAt:       string;
  assignedAt?:      string;
  completedAt?:     string;
}
