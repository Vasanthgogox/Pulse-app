/** Reference options from dispatcher-portal-pro AddClientModal. */

export const PAYMENT_TERMS_OPTIONS = [
  '7 Days',
  '15 Days',
  '30 Days',
  '45 Days',
  '60 Days',
  '75 Days',
  '90 Days',
  'Instant Payment',
] as const;

export const INVOICE_FREQUENCY_OPTIONS = [
  'Per Trip',
  'Weekly',
  'Bi-Weekly',
  'Fortnightly',
  'Monthly',
  'Quarterly',
  'Annually',
] as const;

export const LANE_PRICING_MODEL_OPTIONS = [
  { value: 'per_mt_km', label: 'Per MT × KM' },
  { value: 'per_trip', label: 'Per trip' },
  { value: 'per_ton', label: 'Per ton' },
  { value: 'per_km', label: 'Per km' },
  { value: 'fixed', label: 'Fixed rate' },
  { value: 'spot', label: 'Spot' },
] as const;

export type PaymentTermsLabel = (typeof PAYMENT_TERMS_OPTIONS)[number];
export type InvoiceFrequencyLabel = (typeof INVOICE_FREQUENCY_OPTIONS)[number];
