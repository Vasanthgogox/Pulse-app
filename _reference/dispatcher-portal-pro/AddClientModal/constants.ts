/**
 * Constants for AddClientPanel
 */

export const PAYMENT_TERMS_OPTIONS = [
  '7 Days',
  '15 Days',
  '30 Days',
  '45 Days',
  '60 Days',
  '75 Days',
  '90 Days',
  'Instant Payment'
] as const;

export const INVOICE_FREQUENCY_OPTIONS = [
  'Per Trip',
  'Weekly',
  'Bi-Weekly',
  'Fortnightly',
  'Monthly',
  'Quarterly',
  'Annually'
] as const;

export const TAB_ORDER = ['company', 'address', 'kam', 'financial', 'lanes', 'remarks'] as const;

export const TAB_LABELS: Record<string, string> = {
  company: 'Company',
  address: 'Address',
  kam: 'KAM & Billing',
  financial: 'Financial',
  lanes: 'Lanes',
  remarks: 'Remarks',
};
