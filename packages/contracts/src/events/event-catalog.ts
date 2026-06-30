/** Domain event catalog — add new events here; never rename published events. */

export const DomainEventName = {
  OrganizationCreated:    'OrganizationCreated',
  WarehouseCreated:       'WarehouseCreated',
  UserInvited:            'UserInvited',
  ExecutionPlanPublished: 'ExecutionPlanPublished',
  ExecutionPlanCancelled: 'ExecutionPlanCancelled',
  IndentCreated:          'IndentCreated',
  DriverAssigned:         'DriverAssigned',
  TripStarted:            'TripStarted',
  StopArrived:            'StopArrived',
  PickupCompleted:        'PickupCompleted',
  DropCompleted:          'DropCompleted',
  PODUploaded:            'PODUploaded',
  TripCompleted:          'TripCompleted',
  SettlementCompleted:    'SettlementCompleted',
  InvoiceGenerated:       'InvoiceGenerated',
} as const;

export type DomainEventName = (typeof DomainEventName)[keyof typeof DomainEventName];

export const DOMAIN_EVENT_VERSIONS: Record<DomainEventName, string> = {
  OrganizationCreated:    'v1',
  WarehouseCreated:       'v1',
  UserInvited:            'v1',
  ExecutionPlanPublished: 'v1',
  ExecutionPlanCancelled: 'v1',
  IndentCreated:          'v1',
  DriverAssigned:         'v1',
  TripStarted:            'v1',
  StopArrived:            'v1',
  PickupCompleted:        'v1',
  DropCompleted:          'v1',
  PODUploaded:            'v1',
  TripCompleted:          'v1',
  SettlementCompleted:    'v1',
  InvoiceGenerated:       'v1',
};
