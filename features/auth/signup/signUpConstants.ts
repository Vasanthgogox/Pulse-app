import type { OperatingModel } from '@/features/auth/services/auth.service';

export type BusinessType = 'SOLE_PROPRIETOR' | 'PARTNERSHIP' | 'PVT_LTD' | 'LLP' | 'OPC' | 'OTHER';
export type EmployeeCount = '1-10' | '11-50' | '51-200' | '201-500' | '500+';
export type FleetSize = '1-5' | '6-15' | '16-30' | '31-50' | '50+';
export type MonthlyVolume = '<50' | '50-200' | '200-500' | '500-1000' | '1000+';

export const OTP_LENGTH = 6;
export const DEBOUNCE_MS = 600;
export const OTP_RESEND_SECS = 30;
export const EMAIL_RESEND_SECS = 60;
export const DESKTOP_BREAKPOINT = 1024;
export const DESKTOP_MAX_PANEL_WIDTH = 560;
export const SCROLL_BOTTOM_PAD = 220;
export const CONFIRM_SCROLL_DELAY_MS = 150;

export const STEP_LABELS = ['Phone', 'Verify', 'Company', 'Details', 'Location', 'Account'] as const;

export const BUSINESS_ACTIVATION_HEADERS: Record<
  number,
  { title: string; subtitle: string }
> = {
  0: {
    title: 'Identity',
    subtitle: 'Verify mobile to begin workspace provisioning',
  },
  1: {
    title: 'Verification',
    subtitle: 'Confirm the code sent to your number',
  },
  2: {
    title: 'Workspace',
    subtitle: 'Name your operator on the Pulse network',
  },
  3: {
    title: 'Operations profile',
    subtitle: 'Fleet model, scale, and structure',
  },
  4: {
    title: 'Base location',
    subtitle: 'Primary office for dispatch context',
  },
  5: {
    title: 'Credentials',
    subtitle: 'Secure account before activation',
  },
};

export const OPERATING_MODELS: { value: OperatingModel; label: string; sub: string }[] = [
  { value: 'ASSET_BASED', label: 'Asset', sub: 'Own trucks' },
  { value: 'NON_ASSET', label: 'Aggregate', sub: 'Broker only' },
  { value: 'HYBRID', label: 'Both', sub: 'Mixed fleet' },
];

export const BUSINESS_TYPES: { value: BusinessType; label: string }[] = [
  { value: 'SOLE_PROPRIETOR', label: 'Sole Proprietor' },
  { value: 'PARTNERSHIP', label: 'Partnership' },
  { value: 'PVT_LTD', label: 'Pvt. Limited' },
  { value: 'LLP', label: 'LLP' },
  { value: 'OPC', label: 'OPC' },
  { value: 'OTHER', label: 'Other' },
];

export const EMPLOYEE_COUNTS: EmployeeCount[] = ['1-10', '11-50', '51-200', '201-500', '500+'];
export const FLEET_SIZES: FleetSize[] = ['1-5', '6-15', '16-30', '31-50', '50+'];
export const MONTHLY_VOLUMES: { value: MonthlyVolume; label: string }[] = [
  { value: '<50', label: 'Under 50' },
  { value: '50-200', label: '50–200' },
  { value: '200-500', label: '200–500' },
  { value: '500-1000', label: '500–1,000' },
  { value: '1000+', label: '1,000+' },
];
