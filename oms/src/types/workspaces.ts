/** Workspaces group capabilities, dashboards, and actions by user role. */

export type WorkspaceId =
  | 'commerce'
  | 'operations'
  | 'execution';

export interface WorkspaceRoute {
  label: string;
  path:   string;
  icon?:  string;
}

export interface PulseWorkspace {
  id:           WorkspaceId;
  label:        string;
  description:  string;
  active:       boolean;
  milestone?:   1 | 2 | 3;
  routes:       WorkspaceRoute[];
}

export const PULSE_WORKSPACES: PulseWorkspace[] = [
  {
    id: 'commerce',
    label: 'Pulse Commerce',
    description: 'Catalog, inventory, customers, orders, planning',
    active: true,
    milestone: 1,
    routes: [
      { label: 'Dashboard', path: '/dashboard' },
      { label: 'Products', path: '/products' },
      { label: 'Orders', path: '/orders' },
      { label: 'Consignees', path: '/customers' },
      { label: 'Warehouses', path: '/warehouses' },
      { label: 'Plan Builder', path: '/execution-plans/build' },
      { label: 'Published Plans', path: '/execution-plans' },
      { label: 'Observatory', path: '/observatory' },
      { label: 'Settings', path: '/settings' },
    ],
  },
  {
    id: 'operations',
    label: 'Pulse Operations',
    description: 'Dispatch, control tower, exceptions',
    active: true,
    milestone: 1,
    routes: [
      { label: 'Control Tower', path: '/execution' },
    ],
  },
  {
    id: 'execution',
    label: 'Pulse Execution',
    description: 'Fleet, driver, POD, trips',
    active: true,
    milestone: 1,
    routes: [
      { label: 'Dashboard', path: '/execution' },
      { label: 'Dispatch', path: '/execution/dispatch' },
      { label: 'Driver', path: '/execution/driver' },
    ],
  },
];

export function getActiveWorkspace(): PulseWorkspace {
  return PULSE_WORKSPACES.find(w => w.id === 'commerce')!;
}
