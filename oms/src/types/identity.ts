/** Pulse Identity — build before Marketplace. */

export type IdentityRole =
  | 'org_admin'
  | 'commerce_manager'
  | 'warehouse_operator'
  | 'dispatcher'
  | 'driver'
  | 'finance_clerk'
  | 'viewer';

export interface PulseCompany {
  id:       string;
  name:     string;
  tenantId: string;
  type:     'shipper' | 'broker' | 'warehouse' | 'manufacturer' | '3pl';
}

export interface PulseUser {
  id:    string;
  email: string;
  name:  string;
  role:  IdentityRole;
}

export interface PulseTeam {
  id:             string;
  name:           string;
  organizationId: string;
  branchId?:      string;
}

export interface IdentityContext {
  company: PulseCompany;
  user:    PulseUser;
  teams:   PulseTeam[];
}

export const MOCK_IDENTITY: IdentityContext = {
  company: {
    id: 'org-demo-001',
    name: 'Demo Logistics Co.',
    tenantId: 'tenant-demo',
    type: 'shipper',
  },
  user: {
    id: 'user-001',
    email: 'admin@demo.pulse.app',
    name: 'Admin User',
    role: 'commerce_manager',
  },
  teams: [
    { id: 'team-ops', name: 'West Operations', organizationId: 'org-demo-001', branchId: 'bu-west-ops' },
  ],
};
